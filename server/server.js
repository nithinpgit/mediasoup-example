const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mediasoup = require('mediasoup');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

let worker, router, producerTransport, consumerTransport, producer, consumer;

async function initMediaSoup() {
    worker = await mediasoup.createWorker();
    router = await worker.createRouter({ mediaCodecs: [
        {
            kind: 'audio',
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2
        },
        {
            kind: 'video',
            mimeType: 'video/VP8',
            clockRate: 90000
        }
    ]});
    console.log(`created worker and router`)
}

app.use(express.static(path.join(__dirname, '../client')));

io.on('connection', async (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('getRouterRtpCapabilities', (callback) => {
        callback(router.rtpCapabilities);
        console.log(`send router capabilities`)
    });

    socket.on('createTransport', async (role,callback) => {
        socket.role = role;
        const transport = await router.createWebRtcTransport({
            listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            appData: { turnServerUrl: 'turn:127.0.0.1:3478?transport=udp' }
        });

        transport.on('dtlsstatechange', dtlsState => {
            console.log(`dtls state `,dtlsState)
            if (dtlsState === 'closed') {
                transport.close();
            }
        });

        transport.on('close', () => {
            console.log(`transport closed`)
        });

        if (socket.role === 'publisher') {
            producerTransport = transport;
        } else {
            consumerTransport = transport;
        }

        callback({
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters
        });
        console.log(`created webrtc transport`)
    });

    socket.on('connectConsumerTransport', async ({ dtlsParameters }, callback) => {
        const transport = consumerTransport;
        await transport.connect({ dtlsParameters });
        callback();
        
    });
    socket.on('connectProducerTransport', async ({ dtlsParameters }, callback) => {
        console.log(`connecting producer transport`)
        const transport = producerTransport;
        console.log('transport conncte...........')
        await transport.connect({ dtlsParameters });
        callback();
        console.log(`successfully connected producer transport`)
       
    });

    socket.on('produce', async ({ kind, rtpParameters }, callback) => {
        console.log(`producing`)
        producer = await producerTransport.produce({ kind, rtpParameters });
        producer.on('transportclose', () => producer.close());
        callback({ id: producer.id });
        console.log(`successfully produced`)
    });

    socket.on('consume', async ({ rtpCapabilities }, callback) => {
        if (!router.canConsume({ producerId: producer.id, rtpCapabilities })) {
            return callback({ error: 'cannot consume' });
        }

        consumer = await consumerTransport.consume({
            producerId: producer.id,
            rtpCapabilities,
            paused: true
        });

        consumer.on('transportclose', () => consumer.close());

        callback({
            id: consumer.id,
            producerId: producer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters
        });
    });

    socket.on('resume', async (callback) => {
        await consumer.resume();
        callback();
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (producer  && socket.role === 'publisher') {
            console.log(`closed producer`)
            producer.close();
            producer = null;
        }
        if (consumer  && socket.role !== 'publisher') {
            console.log(`closed consumer`)
            consumer.close();
            consumer = null;
        }
        if (producerTransport && socket.role === 'publisher') {
            console.log(`closed producer transport`)
            producerTransport.close();
            producerTransport = null;
            producerTransport = null;
        }
        if (consumerTransport && socket.role !== 'publisher') {
            console.log(`closed consumer transport`)
            consumerTransport.close();
            consumerTransport = null;
        }
    });
});

module.exports = {initMediaSoup,server}
