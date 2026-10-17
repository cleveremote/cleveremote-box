const dgram = require('node:dgram');

const socket = dgram.createSocket({
  type: 'udp4',
  reuseAddr: true,
});

socket.on('message', (message, remote) => {
  console.log('\nRéponse reçue de', remote.address, 'port', remote.port);
  console.log('Longueur :', message.length);
  console.log('Hex :', message.toString('hex'));

  if (message.length >= 50 &&
      message[0] === 0x5A &&
      message[1] === 0x4C) {

    const deviceId = message
      .subarray(34, 40)
      .toString('hex')
      .toUpperCase();

    const deviceName = message
      .subarray(41, 50)
      .toString('ascii')
      .replace(/\0+$/, '');

    console.log('IP       :', remote.address);
    console.log('Port UDP :', remote.port);
    console.log('Device ID:', deviceId);
    console.log('Nom      :', deviceName);
  }
});

socket.on('error', (err) => {
  console.error('Erreur UDP :', err);
});

socket.bind(0, '0.0.0.0', () => {
  socket.setBroadcast(true);

  // Remplacer par les 170 octets exacts capturés dans Wireshark.
  const payload = Buffer.from(
    '5a4c00005085da736085da735085da735085da73ece71a009670cc736085da738911359efee91a0001000000010000000ce81a005085da73c4e71a0050e81a004061d873fffffffffce71a008244cc7301000000fee91a0010e81a00fee91a000100000024e81a00e247cc733047d40054314700ec47cc73fee91a00fee91a0038e81a009948cc73010000005431470084e81a0014ea1a00418e4100543147007a59d40014ea1a0084e8',
   'hex'
  );

  socket.send(payload, 1092, '255.255.255.255', (err) => {
    if (err) console.error('Erreur envoi :', err);
    else console.log('Requête de découverte envoyée');
  });
});

setTimeout(() => socket.close(), 5000);
