const SERVERS = {
    "iceServers": [{
        "url": "stun:stun.example.org"
    }]
};

function get_id() {
    let value = "; " + document.cookie;
    let parts = value.split("; id=");
    if (parts.length === 2) return parts.pop().split(";").shift();
}

export default class Conference {
    constructor(channel) {
        this.localStream = null;
        this.localVideo = document.getElementById("localVideo");
        this.remoteVideos = document.getElementById("remoteVideos");
        this.messageInput = document.getElementById("message");
        this.messages = document.getElementById("messages");
        this.channel = channel;
        this.localPeerConnections = {};
        this.sendChannels = {};
        this.receiveChannels = {};
        this.initialize();
        this.initializeChannelEvents();
        this.initializeDOMEvents();
    }
    initializeChannelEvents() {
        console.log("Initializing channel events");
        this.channel.on("message", payload => {
            let participant = payload.id;
            if(participant !== get_id() && payload.to === get_id()) {
                let message = JSON.parse(payload.body);
                this.initializePeerConnections(participant);
                if (message.sdp) {
                    this.gotRemoteDescription(message.sdp, participant);
                } else {
                    this.gotRemoteIceCandidate(message, participant);
                }
            }
        });

        this.channel.on("left", payload => {
            let participant = payload.id;
            delete this.localPeerConnections[participant];
            delete this.sendChannels[participant];
            delete this.receiveChannels[participant];
            let remoteVideo = document.getElementById('remoteVideo-' + participant);
            this.remoteVideos.removeChild(remoteVideo);
        });
    }
    initialize() {
        this.getUserMedia()
    }
    initializeDOMEvents() {
        let sendButton = document.getElementById("send");
        let sendMessageCallback = () => {
            let messageText = this.messageInput.value;
            this.appendMessage(get_id(), messageText);
            this.messageInput.value = '';
            Object.values(this.sendChannels).forEach(sendChannel => {
                sendChannel.send(messageText);
            })
        };
        this.messageInput.addEventListener('keypress', (e) => {
            if(e.keyCode === 13) {
                sendMessageCallback()
            }
        }, false);
        sendButton.addEventListener('click', sendMessageCallback , false);
        window.onbeforeunload = (e) => {
            Object.values(this.localPeerConnections).forEach(connection => {
                connection.close();
            });
            this.channel.push("leaving", {
                id: get_id()
            })
        };
    }
    getUserMedia() {
        console.log("Getting user media");
        navigator.getUserMedia({video:true, audio:true}, (stream) => this.gotUserMedia(stream), error => {
            console.log("getUserMedia error: ", error);
        });
    }
    gotUserMedia(stream) {
        console.log("Got user media");
        this.localVideo.src = URL.createObjectURL(stream);
        this.localStream = stream;
        //this.localStream.getAudioTracks()[0].enabled = false;
        let idObject = {id: get_id()};
        this.channel.push("ready", idObject)
            .receive("ready", (response) => {
                response.participants.forEach(participant => {
                    this.call(participant)
                })
            })
    }
    gotLocalIceCandidate(event, participant) {
        if (event.candidate) {
            this.addLocalIceCandidate(event.candidate)
        }
    }
    gotRemoteStream(event, participant) {
        console.log("Received remote stream");
        let source = URL.createObjectURL(event.stream);
        let remoteVideoId = 'remoteVideo-' + participant;
        let remoteVideo = $('#' + remoteVideoId);
        if(remoteVideo.length === 1) {
            remoteVideo.src = source;
        } else {
            $(this.remoteVideos).append(
                '<video id="' + remoteVideoId + '" class="remoteVideo" src="' + source + '" autoplay></video>'
            );
        }
        this.localStream.getAudioTracks()[0].enabled = true;
    }
    call(participant) {
        console.log("Starting call");
        this.initializePeerConnections(participant);
        this.localPeerConnections[participant].createOffer().then((description) => {
                this.gotLocalDescription(description, participant);
                console.log("Offer sent");
            }, (err) => Conference.handleError(err, participant)
        );
    }
    gotRemoteIceCandidate(event, participant) {
        if (event.candidate) {
            this.localPeerConnections[participant].addIceCandidate(new RTCIceCandidate(event.candidate));
        }
    }
    gotLocalDescription(description, participant){
        this.localPeerConnections[participant].setLocalDescription(description).then(
            () => this.afterSetLocalDescription(participant), Conference.handleError
        );
    }
    afterSetLocalDescription(participant) {
        this.channel.push("message", {
            body: JSON.stringify({"sdp": this.localPeerConnections[participant].localDescription}),
            from: get_id(),
            to: participant
        });
    }
    gotRemoteDescription(description, participant) {
        console.log("Got remote description");
        this.localPeerConnections[participant].setRemoteDescription(description).then(() => {
            if(this.localPeerConnections[participant].remoteDescription.type === 'offer') {
                this.localPeerConnections[participant].createAnswer().then(
                    (description) => {
                        this.gotLocalDescription(description, participant);
                        console.log("Answer sent")
                    }, (err) => Conference.handleError(err, participant)
                )
            }
        }, (err) => Conference.handleError(err, participant));

    }
    addLocalIceCandidate(participant, candidate) {
        this.channel.push("message", {
            body: JSON.stringify({"candidate": candidate}),
            from: get_id(),
            to: participant
        });
    }
    initializePeerConnections(participant) {
        if(!this.localPeerConnections[participant]) {
            this.localPeerConnections[participant] = RTCPeerConnection(SERVERS);
            this.localPeerConnections[participant].onicecandidate = (event) => this.gotLocalIceCandidate(event, participant);
            this.localPeerConnections[participant].addStream(this.localStream);
            this.localPeerConnections[participant].oniceconnectionstatechange = () => {
                console.log('Local ICE state: ', this.localPeerConnections[participant].iceConnectionState);
            };
            this.localPeerConnections[participant].onaddstream = (event) => this.gotRemoteStream(event, participant);
            this.sendChannels[participant] = this.localPeerConnections[participant].createDataChannel("sendChannel");
            this.sendChannels[participant].onopen = () => console.log("Send channel opened");
            this.sendChannels[participant].onclose = () => console.log("Send channel closed");

            this.localPeerConnections[participant].ondatachannel = (e) => this.gotReceiveChannel(participant, e);
        }
    }
    gotReceiveChannel(participant, event) {
        this.receiveChannels[participant] = event.channel;
        this.receiveChannels[participant].onmessage = (e) => this.gotMessage(participant, e);
        this.receiveChannels[participant].onopen = () => console.log("Receive channel opened");
        this.receiveChannels[participant].onclose = () => console.log("Receive channel closed");
    }
    gotMessage(participant, event) {
        this.appendMessage(participant, event.data);
    }
    appendMessage(participant, message) {
        $(this.messages).append(
            '<div>' + participant + ':' + message + '</div>'
        );
        this.messages.scrollTop = this.messages.scrollHeight;
    }
    static handleError(error, participant) {
        console.error("from " + participant + "->" + error.name + ": " + error.message);
    }
}