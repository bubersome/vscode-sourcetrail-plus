'use strict';

const vscode = require('vscode');
const net = require('net');

let output;

function log(level, msg) {
    if (!output) return;
    const ts = new Date().toISOString();
    output.appendLine(`[${ts}] [${level}] ${msg}`);
}

function activate(context) {
    output = vscode.window.createOutputChannel('Sourcetrail');
    log('INFO', 'Extension activated');

    const sourcetrail = new Sourcetrail();

    const commands = [
        ['extension.startServer', () => sourcetrail.restartServer()],
        ['extension.stopServer', () => sourcetrail.stopServer()],
        ['extension.sendLocation', () => sourcetrail.sendLocation()],
        ['extension.sendPing', () => sourcetrail.sendPing()],
        ['extension.reconnect', () => sourcetrail.reconnect()],
        ['extension.showOutput', () => output.show()],
        ['extension.showLastError', () => sourcetrail.showLastError()],
    ];
    for (const [id, fn] of commands) {
        context.subscriptions.push(vscode.commands.registerCommand(id, fn));
    }

    // Re-register server when port config changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('sourcetrail')) {
            log('INFO', 'Config changed → restarting server');
            sourcetrail.restartServer();
        }
    }));

    context.subscriptions.push(sourcetrail);
}

exports.activate = activate;

class Sourcetrail {
    constructor() {
        this._lastError = null;
        this._server = null;
        this._retryTimer = null;
        this._retryAttempt = 0;
        this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        this._statusBarItem.command = 'extension.showOutput';
        this.setStatus('disconnected');
        this._statusBarItem.show();

        if (this._cfg('startServerAtStartup', true)) {
            this.restartServer();
        }
    }

    _cfg(key, dflt) {
        const v = vscode.workspace.getConfiguration('sourcetrail').get(key);
        return v !== undefined ? v : dflt;
    }

    setStatus(state, detail) {
        const icons = {
            disconnected: '$(circle-slash)',
            connected: '$(check)',
            connecting: '$(sync~spin)',
            error: '$(error)',
        };
        const tip = detail ? ` ${detail}` : '';
        this._statusBarItem.text = `${icons[state] || ''} Sourcetrail${tip}`;
        this._statusBarItem.tooltip = `Sourcetrail bridge (${state}). Click to show Output.`;
    }

    restartServer() {
        const port = this._cfg('pluginPort', 17666);
        const ip = this._cfg('ip', '127.0.0.1');

        if (this._server) {
            try { this._server.close(); } catch (_) {}
            this._server = null;
        }
        if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = null;
        }

        this.setStatus('connecting');
        log('INFO', `Starting server on ${ip}:${port}`);

        const me = this;
        const server = net.createServer(socket => {
            socket.on('data', data => me.processMessage(data.toString()));
            socket.on('error', err => {
                me._lastError = `Recv error: ${err.message}`;
                log('ERROR', me._lastError);
                me.setStatus('error', '(recv)');
            });
        });
        server.on('error', err => {
            me._lastError = `Listen error on ${ip}:${port}: ${err.message}`;
            log('ERROR', me._lastError);
            me.setStatus('error', `(port ${port})`);
            // EADDRINUSE → retry with exponential backoff
            if (err.code === 'EADDRINUSE') {
                const delay = Math.min(30000, 500 * Math.pow(2, me._retryAttempt));
                me._retryAttempt++;
                log('INFO', `Will retry in ${delay}ms (attempt ${me._retryAttempt})`);
                me._retryTimer = setTimeout(() => me.restartServer(), delay);
            }
        });
        server.on('listening', () => {
            log('INFO', `Listening on ${ip}:${port}`);
            me._retryAttempt = 0;
            me.setStatus('connected');
            // ping Sourcetrail to confirm bridge
            me.sendPing();
        });

        server.listen(port, ip);
        this._server = server;
    }

    stopServer() {
        if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = null;
        }
        if (this._server) {
            try { this._server.close(); } catch (_) {}
            this._server = null;
        }
        this.setStatus('disconnected');
        log('INFO', 'Server stopped');
    }

    reconnect() {
        log('INFO', 'Manual reconnect');
        this.restartServer();
    }

    showLastError() {
        if (this._lastError) {
            vscode.window.showInformationMessage(`Sourcetrail last error: ${this._lastError}`);
        } else {
            vscode.window.showInformationMessage('Sourcetrail: no recent errors.');
        }
        output.show();
    }

    sendPing() {
        this.sendMessage('ping>>VS Code<EOM>', 'ping');
    }

    sendLocation() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Sourcetrail: no active editor.');
            return;
        }
        const path = editor.document.uri.fsPath;
        const line = editor.selection.active.line + 1;
        const col = editor.selection.active.character + 1;
        const msg = `setActiveToken>>${path}>>${line}>>${col}<EOM>`;
        this.sendMessage(msg, 'sendLocation');
    }

    sendMessage(message, label) {
        const port = this._cfg('sourcetrailPort', 17667);
        const ip = this._cfg('ip', '127.0.0.1');
        log('INFO', `→ ${label}: ${message.replace(/<EOM>$/, '')}`);

        const me = this;
        const conn = net.createConnection(port, ip);
        conn.setTimeout(3000);
        conn.on('connect', () => {
            conn.write(message);
            conn.end();
            log('INFO', `✓ ${label} sent`);
        });
        conn.on('error', err => {
            me._lastError = `Send error to ${ip}:${port}: ${err.message}`;
            log('ERROR', me._lastError);
            vscode.window.showErrorMessage(
                `Sourcetrail: cannot send (${err.code || err.message}). Is Sourcetrail running on port ${port}?`
            );
            me.setStatus('error', `(send ${err.code || ''})`);
        });
        conn.on('timeout', () => {
            me._lastError = `Send timeout to ${ip}:${port}`;
            log('ERROR', me._lastError);
            conn.destroy();
        });
    }

    processMessage(message) {
        log('INFO', `← ${message.replace(/<EOM>$/, '')}`);
        const parts = message.split('>>');
        const type = parts[0];

        if (type === 'ping') {
            this.setStatus('connected');
            return;
        }
        if (type === 'moveCursor' && parts.length >= 4) {
            const filePath = parts[1];
            const line = parseInt(parts[2], 10);
            const col = parseInt(parts[3], 10);
            const uri = vscode.Uri.file(filePath);
            vscode.commands.executeCommand('vscode.open', uri).then(() => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) return;
                const pos = new vscode.Position(line - 1, col - 1);
                editor.selections = [new vscode.Selection(pos, pos)];
                vscode.commands.executeCommand('revealLine', { lineNumber: line - 1, at: 'center' });
            });
            return;
        }
        log('WARN', `Unknown message type: ${type}`);
        this._lastError = `Received unknown message type: ${type}`;
    }

    dispose() {
        this.stopServer();
        this._statusBarItem.dispose();
        if (output) output.dispose();
    }
}

function deactivate() {}
exports.deactivate = deactivate;
