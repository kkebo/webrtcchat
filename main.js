(function() {
    'use strict';

    /*
        initial
    */
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || window.navigator.mozGetUserMedia;
    window.URL = window.URL || window.webkitURL;
    window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
    window.RTCSessionDescription = window.RTCSessionDescription || window.webkitRTCSessionDescription || window.mozRTCSessionDescription;
    window.RTCIceCandidate = window.RTCIceCandidate || window.webkitRTCIceCandidate || window.mozRTCIceCandidate;

    var peer = new window.RTCPeerConnection({'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]});
    var dataChannel = peer.createDataChannel('Text');
    var socket = new window.WebSocket('ws://192.168.200.104:51234/');

    var myuuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = 0 | Math.random() * 16;
        return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    var partneruuid = '';
    var users = [myuuid];
    var myname = prompt('Please enter your name', 'Anonymous');
    if (myname === '') {
        myname = 'Anonymous';
    } else if (myname == null) {
        peer.close();
        socket.close();
        return;
    }
    
    navigator.getUserMedia({
            audio: true,
            video: true
        }, function(stream) {
            document.getElementById('localVideo').src = window.URL.createObjectURL(stream);
            peer.addStream(stream);

            socket.send(JSON.stringify({
                'type': 'join',
                'name': myname,
                'from': myuuid
            }));
        }, function(error) {
            console.log(error.name + ': ' + error.message);
        }
    );
    
    // unload による切断処理
    window.addEventListener('beforeunload', function(event) {
        socket.send(JSON.stringify({
            'type': 'quit',
            'from': myuuid
        }));
        peer.close();
        socket.close();
    });

    // offer を送信
    function sendOffer(uuid) {
        peer.createOffer(function(offer) {
            console.log('createOffer succeeded');
            peer.setLocalDescription(new window.RTCSessionDescription(offer), function() {
                console.log('setLocalDescription succeeded');
                socket.send(JSON.stringify({
                    'type': 'sdp',
                    'sdp': offer,
                    'to': uuid,
                    'from': myuuid
                }));
            }, onError);
        }, onError);
    }

    // close ボタンを押した後の処理
    function pressClose() {
        alert('通話終了ボタンは未完成．続けて使用する場合はページを再読み込みしてください．');
        
        peer.close();
        peer = new window.RTCPeerConnection({'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]});
        dataChannel = peer.createDataChannel('Text');

        var remoteVideo = document.getElementById('remoteVideo');
        var localVideo = document.getElementById('localVideo');
        document.getElementById('videos').removeChild(document.getElementById('close'));
        remoteVideo.src = '';
        remoteVideo.classList.add('hidden');
        document.getElementById('contacts').classList.remove('hidden');
        localVideo.classList.remove('sub');
        document.getElementById('chat').classList.add('hidden');
    }
    
    // RTCPeerConnection のエラー時
    function onError() {
        var videos = document.getElementsByTagName('video');
        for (var i = 0; i < videos.length; i++) {
            videos[i].pause();
        }

        console.log('error');

        peer.close();
    }

    /*
        WebSocket event
    */
    socket.addEventListener('message', function(event) {
        var message = JSON.parse(event.data);

        switch (message.type) {
            case 'sdp':
                if (message.to === myuuid && message.sdp && message.from) {
                    var sdp = message.sdp;
                    if (sdp.type === 'offer') {
                        if (confirm('接続しますか？')) {
                            peer.setRemoteDescription(new window.RTCSessionDescription(sdp), function() {
                                peer.createAnswer(function(answer) {
                                    peer.setLocalDescription(new window.RTCSessionDescription(answer), function() {
                                        socket.send(JSON.stringify({
                                            'type': 'sdp',
                                            'sdp': answer,
                                            'to': message.from,
                                            'from': myuuid
                                        }));
                                        partneruuid = message.from;
                                    }, onError);
                                    
                                    peer.addEventListener('datachannel', function(event) {
                                        dataChannel = event.channel;
                                        dataChannel.addEventListener('message', onDCMessage);
                                    });
                                }, onError);
                            }, onError);
                        } else {
                            socket.send(JSON.stringify({
                                'type': 'close',
                                'to': message.from,
                                'from': myuuid
                            }));
                        }
                    } else if (sdp.type === 'answer') {
                        peer.setRemoteDescription(new window.RTCSessionDescription(sdp), function() {
                            partneruuid = message.from
                        }, function() {});
                    }
                }
                break;
            case 'candidate':
                if (message.candidate) {
                    peer.addIceCandidate(new window.RTCIceCandidate(message.candidate), function() {}, function() {});
                }
                break;
            case 'join':
                if (users.indexOf(message.from) < 0 && message.from && message.name) {
                    // 自分の情報も送る
                    socket.send(JSON.stringify({
                        'type': 'join',
                        'name': myname,
                        'from': myuuid
                    }));
                    
                    // 新しいユーザーをリストに追加
                    var item = document.createElement('li');
                    var link = document.createElement('a');
                    link.href = '#';
                    link.id = message.from;
                    link.textContent = message.name;
                    item.appendChild(link);
                    item.addEventListener('click', function() {
                        // hide contacts
                        document.getElementById('contacts').classList.add('hidden');
                        document.getElementById('chat').classList.remove('hidden');

                        sendOffer(message.from);
                    });
                    document.getElementById('userList').appendChild(item);
                    users.push(message.from);
                    
                    console.log('join: ' + message.from);
                }
                break;
            case 'quit':
                if (message.from) {
                    console.log('quit: ' + message.from);
                    
                    users.some(function(v, i){
                        if (v == message.from) users.splice(i, 1);
                    });
                    
                    document.getElementById('userList').removeChild(document.getElementById(message.from).parentElement);
                }
                break;
            case 'close':
                if (message.from === partneruuid && message.to === myuuid) {
                    partneruuid = '';
                    pressClose();
                }
                break;
        }
    });

    /*
        RTCPeerConnection events
    */
    peer.addEventListener('icecandidate', function(event) {
        console.log('onicecandidate');
        if (event.candidate) {
            socket.send(JSON.stringify({
                'type': 'candidate',
                'candidate': event.candidate
            }));
        }
    });

    peer.addEventListener('addstream', function(event) {
        console.log('onaddstream');
        
        var localVideo = document.getElementById('localVideo');
        var remoteVideo = document.getElementById('remoteVideo');
        
        // set video stream
        remoteVideo.src = window.URL.createObjectURL(event.stream);
        remoteVideo.classList.remove('hidden');
        localVideo.classList.add('sub');
        
        // hide contacts
        document.getElementById('contacts').classList.add('hidden');
        
        // show chat
        document.getElementById('chat').classList.remove('hidden');
        
        // create close button
        var close = document.createElement('div');
        close.innerHTML = '&#x2715;';
        close.id = 'close';
        close.addEventListener('click', function() {
            socket.send(JSON.stringify({
                'type': 'close',
                'to': partneruuid,
                'from': myuuid
            }));
            
            pressClose();
        });
        document.getElementById('videos').appendChild(close);
    });
    
    /*
        RTCPeerConnection DataChannel events
    */
    function onDCMessage(event) {
        var comment = document.createElement('li');
        comment.textContent = event.data;
        document.getElementById('comments').appendChild(comment);
        var commentView = document.getElementById('commentView');
        commentView.scrollTop = commentView.scrollHeight;
    }
    
    dataChannel.addEventListener('message', onDCMessage);
    
    function submit() {
        var input = document.getElementById('chatInput');
        var inputValue = input.value + ' - ' + myname;
        
        var mycomment = document.createElement('li');
        mycomment.textContent = inputValue;
        mycomment.style.color = 'orange';
        document.getElementById('comments').appendChild(mycomment);
        var commentView = document.getElementById('commentView');
        commentView.scrollTop = commentView.scrollHeight;
        
        dataChannel.send(inputValue);
        
        input.value = '';
    }
    
    document.getElementById('chatInput').addEventListener('keypress', function(event) {
        if (event.keyCode === 13) {
            submit();
        }
    });
    
    document.getElementById('chatSubmit').addEventListener('click', submit);
})();
