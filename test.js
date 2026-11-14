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
    '5a4c00004cf09c7874e919000000000030f09c78f0e762004cf09c787b518f784cf09c78b6980e7a74e91900dce819009d4c8f784cf09c7874e9190074b6450000000000246a6300ece81900fdc29178504e8f7874e91900c5fd8f7874b64500c6aa947874b6450074e919004ce91900710f9378650b93786d0b93781a990e7a6250b300ca50b3000100000060e9190094081f000100000074e91900c0004a00c0004a000000400010e9',
   'hex'
  );

  socket.send(payload, 1092, '255.255.255.255', (err) => {
    if (err) console.error('Erreur envoi :', err);
    else console.log('Requête de découverte envoyée');
  });
});

setTimeout(() => socket.close(), 5000);
