import { Device } from 'mediasoup-client';
const role = new URLSearchParams(window.location.search).get('role');
const socket = io();
let device, producerTransport, consumerTransport, producer, consumer;

async function getMedia() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('localVideo').srcObject = stream;
    return stream;
}

async function publisher() {
    const stream = await getMedia();
    device = new Device();

    socket.emit('getRouterRtpCapabilities', async (rtpCapabilities) => {
        console.log(`rtpCapabilities recieved`,rtpCapabilities)
        await device.load({ routerRtpCapabilities: rtpCapabilities });

        socket.emit('createTransport','publisher', async ({ id, iceParameters, iceCandidates, dtlsParameters }) => {
            console.log(`transport created`)
            producerTransport = device.createSendTransport({
                id, iceParameters, iceCandidates, dtlsParameters
            });

            producerTransport.on('connect', ({ dtlsParameters }, callback) => {
                console.log(`connect transport request`)
                socket.emit('connectProducerTransport', { dtlsParameters }, callback);
            });

            producerTransport.on('produce', async ({ kind, rtpParameters }, callback) => {
                console.log(`sending produce to server`)
                socket.emit('produce', { kind, rtpParameters }, callback);
            });

            producerTransport.on('connectionstatechange', connectionState => {
                console.log('send transport connection state change [state:%s]', connectionState);
            });
    
            const track = stream.getTracks()[1];
            try{
                console.log(`trying to produce`)
                producer = await producerTransport.produce({ track });
                console.log(`produced`)
            }catch(e){
                console.log(`unable to produce track`,e)
            }
            
            
            
        });
    });
}

socket.on('connect', () => {
    if(role === `publisher`){
        publisher();
    }else{
        subscriber();
    }
    
});
async function subscriber(){
    //console.log(`subscribing`)
    //socket.on('newProducer', async () => {
        //console.log(`on new producer`)
        device = new Device();
        socket.emit('getRouterRtpCapabilities', async (rtpCapabilities) => {
            console.log(`rtpCapabilities recieved`,rtpCapabilities)
            await device.load({ routerRtpCapabilities: rtpCapabilities });
            socket.emit('createTransport','subscriber', async ({ id, iceParameters, iceCandidates, dtlsParameters }) => {
                console.log(`transport created`)
                consumerTransport = device.createRecvTransport({
                    id, iceParameters, iceCandidates, dtlsParameters
                });
        
                consumerTransport.on('connect', ({ dtlsParameters }, callback) => {
                    console.log(`connect transport request`)
                    socket.emit('connectConsumerTransport', { dtlsParameters }, callback);
                });
        
                socket.emit('consume', { rtpCapabilities: device.rtpCapabilities }, async ({ id, producerId, kind, rtpParameters }) => {
                    console.log(`consuming`)
                    consumer = await consumerTransport.consume({
                        id, producerId, kind, rtpParameters
                    });
                    console.log(`receive remote stream`)
                    const remoteStream = new MediaStream();
                    remoteStream.addTrack(consumer.track);
                    document.getElementById('remoteVideo').srcObject = remoteStream;
        
                    socket.emit('resume',()=>{

                    });
                });
            });
        });
   // });
}
