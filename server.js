const { PeerServer } = require('peer');

const port = process.env.PORT || 9000;

const server = PeerServer({
  port: port,
  path: '/peerjs',
  allow_discovery: true
});

server.on('connection', (client) => {
  console.log(`Client connected: ${client.getId()}`);
});

server.on('disconnect', (client) => {
  console.log(`Client disconnected: ${client.getId()}`);
});

console.log(`PeerJS server running on port ${port}`);
