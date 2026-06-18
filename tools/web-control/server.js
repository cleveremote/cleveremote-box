/* eslint-disable */
// Relais Socket.IO de test local pour piloter une box cleveremote-box depuis une page HTML.
// La box est un CLIENT Socket.IO (voir src/common/websocket/socket-io-client.provider.ts) :
// elle se connecte vers SOCKET_SERVER_LOCAL et ecoute des evenements (MessagePattern) avec
// accuse de reception (ack). Ce relais joue le role de ce serveur en local :
//  - la box s'y connecte avec les headers { boxId, type: 'box' }
//  - la page HTML s'y connecte comme client classique et emet les memes evenements
//    (ex: 'box/execution/process'), le relais les retransmet a la box et renvoie l'ack.
//
// Lancement : node tools/web-control/server.js
// Puis configurer SOCKET_SERVER_LOCAL=http://localhost:<PORT> dans .env avant de demarrer la box.

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 5050;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

let boxSocket = null;
let boxId = null;

function broadcastBoxStatus() {
    io.emit('relay/box-status', { connected: !!boxSocket, boxId });
}

io.on('connection', (socket) => {
    const type = socket.handshake.headers.type || socket.handshake.query.type;

    if (type === 'box') {
        boxSocket = socket;
        boxId = socket.handshake.headers.boxid || socket.handshake.query.boxId || null;
        console.log(`[relay] box connectee (${boxId || 'id inconnu'})`);
        broadcastBoxStatus();

        socket.on('disconnect', () => {
            if (boxSocket === socket) {
                boxSocket = null;
                boxId = null;
                console.log('[relay] box deconnectee');
                broadcastBoxStatus();
            }
        });
        return;
    }

    console.log('[relay] client UI connecte');
    socket.emit('relay/box-status', { connected: !!boxSocket, boxId });

    // Retransmet tout evenement emis par la page HTML vers la box, et relaie l'ack en retour.
    socket.onAny((event, data, callback) => {
        if (event.startsWith('relay/')) return;
        if (!boxSocket) {
            if (typeof callback === 'function') callback({ error: 'box non connectee' });
            return;
        }
        boxSocket.emit(event, data, (response) => {
            if (typeof callback === 'function') callback(response);
        });
    });
});

httpServer.listen(PORT, () => {
    console.log(`[relay] en ecoute sur http://localhost:${PORT}`);
});
