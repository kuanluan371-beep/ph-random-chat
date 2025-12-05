const APP_CONFIG = {
    ROOM_PREFIX: 'ph-random-chat-',
    TYPING_TIMEOUT: 2000,
    CONNECTION_TIMEOUT: 15000,
    QUICK_CONNECT_TIMEOUT: 150,  // Reduced from 400ms to 150ms for faster attempts
    RETRY_DELAY: 50,              // Reduced from 200ms to 50ms for quicker retries
    WAITING_ROOM_TIMEOUT: 300,    // Reduced from 800ms to 300ms for faster rotation
    RECONNECT_INITIAL_DELAY: 500, // Reduced from 1000ms to 500ms
    RECONNECT_MAX_DELAY: 30000,
    RECONNECT_MULTIPLIER: 1.5,
    MAX_RECONNECT_ATTEMPTS: 10
};

class RandomChatApp {
    constructor() {
        this.peer = null;
        this.connection = null;
        this.isSearching = false;
        this.isConnected = false;
        this.typingTimer = null;
        this.typingSent = false;
        this.typingIndicatorTimer = null;
        this.waitingTimeout = null;
        this.roomQueue = [];
        this.currentRoom = null;
        this.myPeerId = null;
        
        this.localStream = null;
        this.remoteStream = null;
        this.mediaConnection = null;
        this.remoteAudioElement = null;
        this.isInCall = false;
        this.isMuted = false;
        this.isVideoOff = false;
        this.callType = null;
        this.callStartTime = null;
        this.callDurationInterval = null;
        this.strangerDisconnectedManually = false;
        this.searchAttempts = 0;
        this.maxSearchAttempts = 15;
        this.searchFailedTimeout = null;
        
        this.reconnectAttempts = 0;
        this.reconnectDelay = APP_CONFIG.RECONNECT_INITIAL_DELAY;
        this.reconnectTimer = null;
        this.isReconnecting = false;
        this.peerReady = false;
        
        this.initElements();
        this.initEventListeners();
        this.initPeer();
    }

    initElements() {
        this.welcomeScreen = document.getElementById('welcomeScreen');
        this.chatContainer = document.getElementById('chatContainer');
        this.startChatBtn = document.getElementById('startChatBtn');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        this.newChatBtn = document.getElementById('newChatBtn');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.typingIndicator = document.getElementById('typingIndicator');
        this.statusBadge = document.getElementById('statusBadge');
        this.statusText = document.getElementById('statusText');
        
        this.audioCallBtn = document.getElementById('audioCallBtn');
        this.videoCallBtn = document.getElementById('videoCallBtn');
        this.callModal = document.getElementById('callModal');
        this.callTitle = document.getElementById('callTitle');
        this.callStatus = document.getElementById('callStatus');
        this.callDuration = document.getElementById('callDuration');
        this.videoContainer = document.getElementById('videoContainer');
        this.callAvatar = document.getElementById('callAvatar');
        this.localVideo = document.getElementById('localVideo');
        this.remoteVideo = document.getElementById('remoteVideo');
        this.toggleMuteBtn = document.getElementById('toggleMuteBtn');
        this.toggleVideoBtn = document.getElementById('toggleVideoBtn');
        this.endCallBtn = document.getElementById('endCallBtn');
        
        this.emojiBtn = document.getElementById('emojiBtn');
        this.emojiPicker = document.getElementById('emojiPicker');
        this.emojiPickerContent = document.getElementById('emojiPickerContent');
        
        this.themeToggle = document.getElementById('themeToggle');
        this.themeIcon = document.getElementById('themeIcon');
        
        this.messageColorBtn = document.getElementById('messageColorBtn');
        this.messageColorModal = document.getElementById('messageColorModal');
        this.closeColorPicker = document.getElementById('closeColorPicker');
        
        this.incomingCallModal = document.getElementById('incomingCallModal');
        this.acceptCallBtn = document.getElementById('acceptCallBtn');
        this.declineCallBtn = document.getElementById('declineCallBtn');
        this.pendingCall = null;
    }

    initEventListeners() {
        this.startChatBtn.addEventListener('click', () => this.startChat());
        this.disconnectBtn.addEventListener('click', () => this.disconnect());
        this.newChatBtn.addEventListener('click', () => this.startNewChat());
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        this.messageInput.addEventListener('input', () => this.handleTyping());
        
        this.audioCallBtn.addEventListener('click', () => this.initiateCall('audio'));
        this.videoCallBtn.addEventListener('click', () => this.initiateCall('video'));
        this.endCallBtn.addEventListener('click', () => this.endCall());
        this.toggleMuteBtn.addEventListener('click', () => this.toggleMute());
        this.toggleVideoBtn.addEventListener('click', () => this.toggleVideo());
        
        this.emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleEmojiPicker();
        });
        
        document.addEventListener('click', (e) => {
            if (!this.emojiPicker.contains(e.target) && e.target !== this.emojiBtn) {
                this.closeEmojiPicker();
            }
        });
        
        // Reposition emoji picker on window resize
        window.addEventListener('resize', () => {
            if (this.emojiPicker.style.display === 'flex') {
                this.closeEmojiPicker();
            }
        });
        
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
        
        this.messageColorBtn.addEventListener('click', () => this.openColorPicker());
        this.closeColorPicker.addEventListener('click', () => this.closeColorPickerModal());
        
        this.acceptCallBtn.addEventListener('click', () => this.acceptIncomingCall());
        this.declineCallBtn.addEventListener('click', () => this.declineIncomingCall());
        
        this.initEmojiPicker();
        this.initTheme();
        this.initMessageColor();
    }



    initPeer() {
        try {
            // Clean up existing peer first
            if (this.peer) {
                try {
                    this.peer.removeAllListeners();
                    if (!this.peer.destroyed) {
                        this.peer.destroy();
                    }
                } catch (e) {
                    console.log('Error cleaning up old peer:', e);
                }
            }

            const peerId = this.generatePeerId();
            this.myPeerId = peerId;
            
            // Use PeerJS cloud server with optimized settings for faster connections
            this.peer = new Peer(peerId, {
                config: {
                    iceServers: [
                        // Multiple STUN servers for NAT traversal
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:stun3.l.google.com:19302' },
                        { urls: 'stun:stun4.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' },
                        { urls: 'stun:stun.relay.metered.ca:80' },
                        // Free TURN servers for cross-network/firewall connectivity (critical for different networks)
                        {
                            urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:80?transport=tcp'],
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        },
                        {
                            urls: ['turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        },
                        // Additional free TURN servers for better reliability across networks
                        {
                            urls: 'turn:relay.metered.ca:80',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        },
                        {
                            urls: 'turn:relay.metered.ca:443',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        }
                    ],
                    iceTransportPolicy: 'all',
                    iceCandidatePoolSize: 10,
                    sdpSemantics: 'unified-plan',
                    bundlePolicy: 'max-bundle',
                    rtcpMuxPolicy: 'require'
                },
                debug: 1,
                pingInterval: 2000,  // Reduced from 3000ms to 2000ms for faster detection
                // Use fastest available PeerJS cloud server
                host: '0.peerjs.com',
                port: 443,
                path: '/',
                secure: true
            });

            this.peer.on('open', (id) => {
                console.log('Peer connected with ID:', id);
                this.myPeerId = id;
                this.peerReady = true;
                this.isReconnecting = false;
                this.reconnectAttempts = 0;
                this.reconnectDelay = APP_CONFIG.RECONNECT_INITIAL_DELAY;
                
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
                
                if (!this.isSearching && !this.isConnected) {
                    this.updateStatus(true, 'Ready');
                }
            });

            this.peer.on('connection', (conn) => {
                if (conn) {
                    this.handleIncomingConnection(conn);
                }
            });

            this.peer.on('call', (call) => {
                if (!call) return;
                
                if (this.isInCall) {
                    try {
                        call.close();
                    } catch (e) {}
                    return;
                }
                
                this.pendingCall = call;
                this.incomingCallModal.style.display = 'flex';
                
                // Show call type in the message
                const callTypeText = this.callType === 'video' ? 'video' : 'audio';
                this.showSystemMessage(`Incoming ${callTypeText} call from stranger...`, 'success');
            });

            this.peer.on('error', (err) => {
                console.error('Peer error:', err.type, err);
                this.peerReady = false;
                
                // Don't retry on unavailable-id errors during waiting room setup
                if (err.type === 'unavailable-id') {
                    return;
                }
                
                // Handle network and server errors with exponential backoff
                if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
                    console.log('Network/server error detected, initiating reconnection...');
                    this.handlePeerReconnection();
                    return;
                }
                
                if (this.isSearching && !this.isConnected) {
                    // If searching and error occurs, retry connection silently
                    console.log('Retrying peer connection...');
                    setTimeout(() => {
                        if (this.isSearching && !this.isConnected && (!this.peer || this.peer.destroyed)) {
                            this.initPeer();
                            setTimeout(() => this.findStranger(), 1000);
                        }
                    }, 2000);
                } else if (!this.isSearching) {
                    this.showSystemMessage('Connection error: network. Please try again.', 'error');
                    this.updateStatus(false, 'Error');
                }
            });

            this.peer.on('disconnected', () => {
                console.log('Peer disconnected from signaling server');
                this.peerReady = false;
                
                if (!this.isSearching && !this.isConnected) {
                    this.updateStatus(false, 'Disconnected');
                }
                
                // Initiate aggressive reconnection
                this.handlePeerReconnection();
            });

        } catch (error) {
            console.error('Failed to initialize peer:', error);
            this.showSystemMessage('Failed to initialize. Please refresh the page.', 'error');
        }
    }

    handlePeerReconnection() {
        // Prevent multiple simultaneous reconnection attempts
        if (this.isReconnecting) {
            console.log('Reconnection already in progress...');
            return;
        }
        
        // Check if we've exceeded max attempts
        if (this.reconnectAttempts >= APP_CONFIG.MAX_RECONNECT_ATTEMPTS) {
            console.log('Max reconnection attempts reached');
            this.showSystemMessage('Connection lost. Please refresh the page.', 'error');
            this.updateStatus(false, 'Error');
            return;
        }
        
        this.isReconnecting = true;
        this.reconnectAttempts++;
        
        console.log(`Reconnection attempt ${this.reconnectAttempts}/${APP_CONFIG.MAX_RECONNECT_ATTEMPTS} in ${this.reconnectDelay}ms...`);
        
        // Clear any existing timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        this.reconnectTimer = setTimeout(() => {
            // Try to reconnect if peer exists and is disconnected
            if (this.peer && !this.peer.destroyed && this.peer.disconnected) {
                console.log('Attempting to reconnect existing peer...');
                try {
                    this.peer.reconnect();
                    
                    // Wait to see if reconnection succeeds
                    setTimeout(() => {
                        if (!this.peerReady) {
                            console.log('Peer reconnect failed, reinitializing...');
                            this.initPeer();
                        }
                        this.isReconnecting = false;
                    }, 3000);
                } catch (e) {
                    console.log('Reconnect error:', e);
                    this.initPeer();
                    this.isReconnecting = false;
                }
            } else {
                // Peer is destroyed or doesn't exist, create new one
                console.log('Creating new peer instance...');
                this.initPeer();
                this.isReconnecting = false;
            }
            
            // Increase delay for next attempt (exponential backoff)
            this.reconnectDelay = Math.min(
                this.reconnectDelay * APP_CONFIG.RECONNECT_MULTIPLIER,
                APP_CONFIG.RECONNECT_MAX_DELAY
            );
        }, this.reconnectDelay);
    }
    
    isPeerReady() {
        return this.peer && 
               !this.peer.destroyed && 
               this.peer.open && 
               !this.peer.disconnected &&
               this.peerReady;
    }

    generatePeerId() {
        return `${APP_CONFIG.ROOM_PREFIX}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    generateRoomId() {
        return Math.floor(Math.random() * 1000);
    }

    startChat() {
        this.welcomeScreen.style.display = 'none';
        this.chatContainer.style.display = 'flex';
        this.isSearching = true;
        this.isConnected = false;
        this.searchAttempts = 0;
        this.messagesContainer.innerHTML = '';
        this.showSearchingAnimation();
        this.connectionStatus.textContent = 'Searching...';
        this.connectionStatus.classList.remove('connected');
        this.updateStatus(true, 'Searching');
        
        // Set timeout to detect if search is taking too long
        this.startSearchFailureDetection();

        // Wait for peer to be ready before searching
        if (this.isPeerReady()) {
            this.findStranger();
        } else if (this.peer && !this.peer.destroyed) {
            this.peer.once('open', () => {
                if (this.isSearching && !this.isConnected) {
                    this.findStranger();
                }
            });
        } else {
            // Reinitialize peer if needed
            this.initPeer();
            setTimeout(() => {
                if (this.isPeerReady() && this.isSearching && !this.isConnected) {
                    this.findStranger();
                }
            }, 100);
        }
    }

    findStranger() {
        if (!this.isSearching || this.isConnected) return;
        
        this.searchAttempts++;

        // Try connecting to a waiting room peer
        const waitingRoomId = `${APP_CONFIG.ROOM_PREFIX}waiting`;
        
        setTimeout(() => {  // Reduced delay from 100ms to 10ms
            if (!this.peer || !this.isSearching || this.isConnected) return;
            
            // Check if peer is open and ready
            if (!this.isPeerReady()) {
                // Peer is not ready, wait for it to open
                console.log('Peer not ready, waiting...');
                if (this.peer && !this.peer.destroyed) {
                    // Wait for peer to open
                    const openHandler = () => {
                        setTimeout(() => {
                            if (this.isSearching && !this.isConnected) {
                                this.findStranger();
                            }
                        }, 100);
                    };
                    this.peer.once('open', openHandler);
                    
                    // Timeout after 2 seconds if peer doesn't open
                    setTimeout(() => {
                        if (this.peer && !this.peer.destroyed) {
                            this.peer.off('open', openHandler);
                        }
                        if (this.isSearching && !this.isConnected) {
                            console.log('Peer failed to open, reinitializing...');
                            this.initPeer();
                            setTimeout(() => {
                                if (this.isSearching && !this.isConnected) {
                                    this.findStranger();
                                }
                            }, 500);
                        }
                    }, 2000);
                } else {
                    // Peer is destroyed, reinitialize
                    this.initPeer();
                    setTimeout(() => {
                        if (this.isSearching && !this.isConnected) {
                            this.findStranger();
                        }
                    }, 1000);
                }
                return;
            }
            
            if (this.isSearching && !this.isConnected) {
                try {
                    const conn = this.peer.connect(waitingRoomId, {
                        reliable: true,
                        serialization: 'json',
                        metadata: { timestamp: Date.now() },
                        config: {
                            iceServers: [
                                { urls: 'stun:stun.l.google.com:19302' },
                                { urls: 'stun:stun1.l.google.com:19302' },
                                { urls: 'stun:stun2.l.google.com:19302' },
                                { urls: 'stun:stun3.l.google.com:19302' },
                                { urls: 'stun:global.stun.twilio.com:3478' },
                                { urls: 'stun:stun.relay.metered.ca:80' },
                                {
                                    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:80?transport=tcp'],
                                    username: 'openrelayproject',
                                    credential: 'openrelayproject'
                                },
                                {
                                    urls: ['turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
                                    username: 'openrelayproject',
                                    credential: 'openrelayproject'
                                },
                                {
                                    urls: 'turn:relay.metered.ca:80',
                                    username: 'openrelayproject',
                                    credential: 'openrelayproject'
                                },
                                {
                                    urls: 'turn:relay.metered.ca:443',
                                    username: 'openrelayproject',
                                    credential: 'openrelayproject'
                                }
                            ],
                            iceTransportPolicy: 'all',
                            iceCandidatePoolSize: 10,
                            bundlePolicy: 'max-bundle',
                            rtcpMuxPolicy: 'require'
                        }
                    });

                    if (!conn) {
                        console.log('Failed to create connection');
                        this.becomeWaitingPeer();
                        return;
                    }

                    let connectionAttempted = false;
                    let timeoutHandle = null;

                    conn.on('open', () => {
                        if (connectionAttempted) return;
                        connectionAttempted = true;
                        if (timeoutHandle) clearTimeout(timeoutHandle);
                        console.log('Connection opened to waiting peer');
                        this.handleConnectionOpen(conn);
                    });

                    conn.on('error', (err) => {
                        if (connectionAttempted) return;
                        if (timeoutHandle) clearTimeout(timeoutHandle);
                        console.log('Connection error to waiting peer:', err);
                        // If no one in waiting room, become the waiting peer
                        if (this.isSearching && !this.isConnected) {
                            this.becomeWaitingPeer();
                        }
                    });

                    // Ultra-fast timeout for instant connection attempts
                    timeoutHandle = setTimeout(() => {
                        if (!connectionAttempted && this.isSearching && !this.isConnected) {
                            connectionAttempted = true;
                            console.log('Connection timeout, becoming waiting peer');
                            try {
                                conn.close();
                            } catch (e) {
                                // Ignore close errors
                            }
                            // Become waiting peer if connection failed
                            this.becomeWaitingPeer();
                        }
                    }, APP_CONFIG.QUICK_CONNECT_TIMEOUT);

                } catch (error) {
                    console.log('Error connecting to waiting peer:', error);
                    if (this.isSearching && !this.isConnected) {
                        this.becomeWaitingPeer();
                    }
                }
            }
        }, 100);
    }

    becomeWaitingPeer() {
        if (!this.isSearching || this.isConnected) return;
        
        console.log('Becoming waiting peer...');
        
        // Clear any existing timeout
        if (this.waitingTimeout) {
            clearTimeout(this.waitingTimeout);
            this.waitingTimeout = null;
        }
        
        // Destroy current peer and create new one with waiting room ID
        const needsDestroy = this.peer && !this.peer.destroyed;
        if (needsDestroy) {
            try {
                this.peer.removeAllListeners();
                this.peer.destroy();
            } catch (e) {
                console.log('Error destroying peer:', e);
            }
        }

        const waitingRoomId = `${APP_CONFIG.ROOM_PREFIX}waiting`;
        
        // Ultra-minimal delay for instant reconnection
        const delay = needsDestroy ? 10 : 0;  // Reduced from 30ms to 10ms
        
        setTimeout(() => {
            if (!this.isSearching || this.isConnected) return;
        
        try {
            this.peer = new Peer(waitingRoomId, {
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:stun3.l.google.com:19302' },
                        { urls: 'stun:stun4.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' },
                        { urls: 'stun:stun.relay.metered.ca:80' },
                        {
                            urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:80?transport=tcp'],
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        },
                        {
                            urls: ['turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        },
                        {
                            urls: 'turn:relay.metered.ca:80',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        },
                        {
                            urls: 'turn:relay.metered.ca:443',
                            username: 'openrelayproject',
                            credential: 'openrelayproject'
                        }
                    ],
                    iceTransportPolicy: 'all',
                    iceCandidatePoolSize: 10,
                    bundlePolicy: 'max-bundle',
                    rtcpMuxPolicy: 'require'
                },
                debug: 1,
                pingInterval: 5000
            });

            this.peer.on('open', (id) => {
                if (!this.isSearching || this.isConnected) return;
                
                console.log('Waiting peer opened with ID:', id);
                
                // Ultra-fast rotation for instant matching
                this.waitingTimeout = setTimeout(() => {
                    if (this.isSearching && !this.isConnected) {
                        console.log('No one connected, switching to connector mode');
                        if (this.peer && !this.peer.destroyed) {
                            try {
                                this.peer.destroy();
                            } catch (e) {
                                // Ignore errors
                            }
                        }
                        setTimeout(() => {
                            if (this.isSearching && !this.isConnected) {
                                this.initPeer();
                                setTimeout(() => {
                                    if (this.isSearching && !this.isConnected) {
                                        this.findStranger();
                                    }
                                }, APP_CONFIG.RETRY_DELAY);  // Now 50ms instead of 200ms
                            }
                        }, 20);  // Reduced from 50ms to 20ms
                    }
                }, APP_CONFIG.WAITING_ROOM_TIMEOUT);  // Now 300ms instead of 800ms
            });

            this.peer.on('connection', (conn) => {
                console.log('Incoming connection received as waiting peer');
                if (!conn) return;
                
                if (this.isSearching && !this.isConnected) {
                    if (this.waitingTimeout) {
                        clearTimeout(this.waitingTimeout);
                        this.waitingTimeout = null;
                    }
                    this.handleIncomingConnection(conn);
                } else {
                    console.log('Rejecting connection - not searching or already connected');
                    try {
                        conn.close();
                    } catch (e) {}
                }
            });

            this.peer.on('call', (call) => {
                if (!call) return;
                
                if (this.isInCall) {
                    try {
                        call.close();
                    } catch (e) {}
                    return;
                }
                
                this.pendingCall = call;
                this.incomingCallModal.style.display = 'flex';
                
                // Show call type in the message
                const callTypeText = this.callType === 'video' ? 'video' : 'audio';
                this.showSystemMessage(`Incoming ${callTypeText} call from stranger...`, 'success');
            });

            this.peer.on('error', (err) => {
                console.log('Waiting peer error:', err.type);
                
                if (this.waitingTimeout) {
                    clearTimeout(this.waitingTimeout);
                    this.waitingTimeout = null;
                }
                
                if (!this.isSearching || this.isConnected) return;
                
                if (err.type === 'unavailable-id') {
                    // Someone else is already waiting, so try to connect to them
                    console.log('Waiting room taken, trying to connect...');
                    setTimeout(() => {
                        if (this.isSearching && !this.isConnected) {
                            this.initPeer();
                            setTimeout(() => {
                                if (this.isSearching && !this.isConnected) {
                                    this.findStranger();
                                }
                            }, 300);
                        }
                    }, 100);
                } else {
                    // Other errors, retry search
                    console.log('Retrying search after error...');
                    setTimeout(() => {
                        if (this.isSearching && !this.isConnected) {
                            this.initPeer();
                            setTimeout(() => {
                                if (this.isSearching && !this.isConnected) {
                                    this.findStranger();
                                }
                            }, 300);
                        }
                    }, 500);
                }
            });
            
            this.peer.on('disconnected', () => {
                if (this.isSearching && !this.isConnected) {
                    setTimeout(() => {
                        if (this.peer && !this.peer.destroyed) {
                            this.peer.reconnect();
                        }
                    }, 1000);
                }
            });
            } catch (error) {
                console.log('Failed to create waiting peer:', error);
                // If creating waiting peer fails, retry as connector
                setTimeout(() => {
                    if (this.isSearching && !this.isConnected) {
                        this.initPeer();
                        setTimeout(() => {
                            if (this.isSearching && !this.isConnected) {
                                this.findStranger();
                            }
                        }, 300);
                    }
                }, 500);
            }
        }, delay);
    }

    handleIncomingConnection(conn) {
        if (!conn) return;
        
        console.log('Incoming connection, isSearching:', this.isSearching, 'isConnected:', this.isConnected);
        
        // Only accept connections if actively searching
        if (this.isConnected || !this.isSearching) {
            console.log('Rejecting incoming connection - not searching or already connected');
            try {
                conn.close();
            } catch (e) {}
            return;
        }
        
        // Verify chat container is visible (user is in chat mode)
        if (this.chatContainer.style.display === 'none') {
            console.log('Rejecting incoming connection - chat not visible');
            try {
                conn.close();
            } catch (e) {}
            return;
        }
        
        // Close any existing connection attempts
        if (this.connection && this.connection !== conn) {
            console.log('Closing existing connection attempt');
            try {
                this.connection.removeAllListeners();
                this.connection.close();
            } catch (e) {}
        }

        this.connection = conn;
        this.setupConnection(conn);
    }

    handleConnectionOpen(conn) {
        if (!conn) return;
        
        console.log('Connection opened, isSearching:', this.isSearching, 'isConnected:', this.isConnected);
        
        // Only accept connections if actively searching
        if (!this.isSearching || this.isConnected) {
            console.log('Rejecting connection open - not searching or already connected');
            try {
                conn.close();
            } catch (e) {}
            return;
        }
        
        // Verify chat container is visible (user is in chat mode)
        if (this.chatContainer.style.display === 'none') {
            console.log('Rejecting connection open - chat not visible');
            try {
                conn.close();
            } catch (e) {}
            return;
        }
        
        // Close any existing connection attempts
        if (this.connection && this.connection !== conn) {
            console.log('Closing existing connection attempt');
            try {
                this.connection.removeAllListeners();
                this.connection.close();
            } catch (e) {}
        }

        this.connection = conn;
        this.setupConnection(conn);
    }

    setupConnection(conn) {
        // CRITICAL: Check if already connected (prevent race conditions)
        if (this.isConnected) {
            console.log('Already connected, rejecting new connection');
            try {
                conn.close();
            } catch (e) {}
            return;
        }
        
        // Only accept if actively searching
        if (!this.isSearching) {
            console.log('Not searching, rejecting connection');
            try {
                conn.close();
            } catch (e) {}
            return;
        }
        
        // Verify chat container is still visible
        if (this.chatContainer.style.display === 'none') {
            console.log('Chat container hidden, rejecting connection');
            try {
                conn.close();
            } catch (e) {}
            return;
        }
        
        // Clear any waiting timeout
        if (this.waitingTimeout) {
            clearTimeout(this.waitingTimeout);
            this.waitingTimeout = null;
        }
        
        // Clear search failure detection
        this.clearSearchFailureDetection();
        
        // Immediately mark as connected to prevent duplicate connections
        this.isSearching = false;
        this.isConnected = true;
        this.searchAttempts = 0;
        
        console.log('Setting up connection, connection open:', conn.open);
        
        // Function to finalize connection setup
        const finalizeConnection = () => {
            console.log('Finalizing connection setup');
            
            // Update UI
            this.connectionStatus.textContent = 'Connected';
            this.connectionStatus.classList.add('connected');
            this.messageInput.disabled = false;
            this.sendBtn.disabled = false;
            this.audioCallBtn.disabled = false;
            this.videoCallBtn.disabled = false;
            this.emojiBtn.disabled = false;
            this.newChatBtn.style.display = 'flex';
            this.messagesContainer.innerHTML = '';
            this.removeSearchingAnimation();
            this.updateStatus(true, 'Chatting');
            this.showSystemMessage('Stranger connected! Say hello.', 'success');
            
            // Send initial handshake to confirm connection
            try {
                conn.send({ type: 'handshake', timestamp: Date.now() });
            } catch (e) {
                console.log('Handshake send failed:', e);
            }
        };
        
        // Set up event listeners
        conn.on('data', (data) => {
            this.handleIncomingData(data);
        });

        conn.on('close', () => {
            this.handleConnectionClose();
        });

        conn.on('error', (err) => {
            console.log('Connection error:', err);
            this.handleConnectionClose();
        });

        // Monitor ICE connection state
        conn.on('iceStateChanged', (state) => {
            console.log('ICE connection state:', state);
            if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                console.log('ICE connection failed');
                this.handleConnectionClose();
            }
        });
        
        // If connection is already open, finalize immediately
        if (conn.open) {
            finalizeConnection();
        } else {
            // Wait for connection to open
            conn.on('open', () => {
                if (this.isConnected && this.connection === conn) {
                    finalizeConnection();
                }
            });
            
            // Timeout if connection doesn't open in 3 seconds
            setTimeout(() => {
                if (this.isConnected && this.connection === conn && !conn.open) {
                    console.log('Connection failed to open, resetting');
                    this.isConnected = false;
                    this.isSearching = true;
                    try {
                        conn.close();
                    } catch (e) {
                        console.log('Error closing failed connection:', e);
                    }
                    this.findStranger();
                }
            }, 3000);
        }
    }

    handleIncomingData(data) {
        if (data.type === 'handshake') {
            console.log('Received handshake from peer');
            // Send handshake back if we haven't already
            if (this.connection && this.isConnected) {
                try {
                    this.connection.send({ type: 'handshake-ack', timestamp: Date.now() });
                } catch (e) {
                    console.log('Handshake-ack send failed:', e);
                }
            }
        } else if (data.type === 'handshake-ack') {
            console.log('Received handshake acknowledgment');
        } else if (data.type === 'message') {
            this.receiveMessage(data.text, data.messageId);
        } else if (data.type === 'typing') {
            this.showTypingIndicator();
        } else if (data.type === 'stop-typing') {
            this.hideTypingIndicator();
        } else if (data.type === 'message-seen') {
            this.markMessageAsSeen(data.messageId);
        } else if (data.type === 'reaction') {
            this.receiveReaction(data.messageId, data.emoji);
        } else if (data.type === 'reaction-remove') {
            this.removeReaction(data.messageId, data.emoji);
        } else if (data.type === 'call-request') {
            this.handleIncomingCall(data.callType);
        } else if (data.type === 'call-end') {
            // Remote peer ended the call, just cleanup without sending back
            this.showSystemMessage('Call ended by stranger.', 'error');
            this.cleanupCallState();
        } else if (data.type === 'call-declined') {
            this.showSystemMessage('Call declined by stranger.', 'error');
            // Always fully reset call state when declined
            this.cleanupCallState();
        } else if (data.type === 'stranger-disconnected') {
            this.strangerDisconnectedManually = true;
            // The connection will close automatically, handleConnectionClose will show the message
        }
    }

    handleIncomingCall(callType) {
        if (this.isInCall) {
            // Already in a call, reject silently
            return;
        }
        this.callType = callType;
        // The actual call will arrive via peer.on('call') event
        // which will show the incoming call modal
    }

    acceptIncomingCall() {
        if (!this.pendingCall) return;

        // Store reference before async operation
        const call = this.pendingCall;
        this.pendingCall = null;
        this.incomingCallModal.style.display = 'none';

        const isVideoCall = this.callType === 'video';
        
        // Set up event listeners BEFORE answering
        call.on('stream', (remoteStream) => {
            this.handleIncomingStream(remoteStream);
        });

        call.on('error', (err) => {
            console.error('Incoming call error:', err);
            this.showSystemMessage('Call connection error', 'error');
            this.cleanupCallState();
        });

        call.on('close', () => {
            console.log('Incoming call closed');
            if (this.isInCall) {
                this.showSystemMessage('Call ended', 'error');
                this.cleanupCallState();
            }
        });

        call.on('iceStateChanged', (state) => {
            console.log('Incoming call ICE state:', state);
            // Only end call on 'closed', not 'failed' (failed can recover)
            if (state === 'closed') {
                this.showSystemMessage('Call connection lost', 'error');
                this.cleanupCallState();
            }
            // For 'failed' state, let it attempt to recover
            if (state === 'failed') {
                console.log('ICE connection failed, attempting recovery...');
                this.callStatus.textContent = 'Reconnecting...';
            }
            if (state === 'connected' || state === 'completed') {
                this.callStatus.textContent = 'Connected';
            }
        });
        
        navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000,
                channelCount: 1
            },
            video: isVideoCall ? {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 24, max: 30 }
            } : false
        }).then(stream => {
            if (!call || call.peerConnection?.connectionState === 'closed') {
                stream.getTracks().forEach(track => track.stop());
                this.showSystemMessage('Call was cancelled', 'error');
                return;
            }
            
            this.localStream = stream;
            
            try {
                call.answer(stream);
            } catch (err) {
                console.error('Error answering call:', err);
                this.showSystemMessage('Failed to answer call', 'error');
                stream.getTracks().forEach(track => track.stop());
                this.cleanupCallState();
                return;
            }
            
            this.callModal.style.display = 'flex';
            this.callTitle.textContent = isVideoCall ? 'Video Call' : 'Voice Call';
            this.callStatus.textContent = 'Connecting...';
            
            if (isVideoCall) {
                this.videoContainer.style.display = 'block';
                this.callAvatar.style.display = 'none';
                this.localVideo.srcObject = stream;
                this.localVideo.muted = true;
                this.toggleVideoBtn.style.display = 'block';
            } else {
                this.videoContainer.style.display = 'none';
                this.callAvatar.style.display = 'flex';
                this.toggleVideoBtn.style.display = 'none';
            }
            
            this.mediaConnection = call;
            this.isInCall = true;
            
            // Disable call buttons during the call
            this.audioCallBtn.disabled = true;
            this.videoCallBtn.disabled = true;
            
            this.startCallDuration();
        }).catch(error => {
            console.error('getUserMedia error:', error);
            const errorMsg = isVideoCall ? 'Failed to access camera/microphone' : 'Failed to access microphone';
            this.showSystemMessage(errorMsg, 'error');
            if (call) {
                try {
                    call.close();
                } catch (e) {}
            }
            this.cleanupCallState();
        });
    }

    declineIncomingCall() {
        // Show message that you declined
        this.showSystemMessage('You declined the call.', 'error');
        
        // Clean up pending call
        if (this.pendingCall) {
            try {
                this.pendingCall.close();
            } catch (e) {}
            this.pendingCall = null;
        }
        
        // Clean up all call state
        this.cleanupCallState();
        
        // Notify the other peer
        if (this.connection && this.isConnected) {
            try {
                this.connection.send({ type: 'call-declined' });
            } catch (e) {}
        }
    }

    sendMessage() {
        const text = this.messageInput.value.trim();
        
        if (!text || !this.connection || !this.isConnected) {
            return;
        }

        // Verify connection is still open and peer is ready
        if (!this.connection.open || !this.isPeerReady()) {
            this.showSystemMessage('Connection lost. Reconnecting...', 'error');
            this.handleConnectionClose();
            return;
        }

        try {
            const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.connection.send({
                type: 'message',
                text: text,
                messageId: messageId,
                timestamp: Date.now()
            });

            this.addMessage(text, 'sent', messageId);
            this.messageInput.value = '';
            this.sendTypingStop();
        } catch (error) {
            console.error('Send message error:', error);
            this.showSystemMessage('Failed to send message.', 'error');
        }
    }

    receiveMessage(text, messageId) {
        this.addMessage(text, 'received', messageId);
        this.hideTypingIndicator();
        
        // Send seen confirmation immediately
        if (this.connection && this.isConnected && messageId) {
            // Use setTimeout 0 to ensure DOM is updated first, then send seen
            setTimeout(() => {
                try {
                    this.connection.send({
                        type: 'message-seen',
                        messageId: messageId
                    });
                } catch (error) {
                }
            }, 0);
        }
    }

    addMessage(text, type, messageId) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        if (messageId) {
            messageDiv.dataset.messageId = messageId;
        }

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = type === 'sent' ? 'You' : 'S';

        const content = document.createElement('div');
        content.className = 'message-content';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.textContent = text;

        // Add 3-dot menu button for desktop
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        const menuBtn = document.createElement('button');
        menuBtn.className = 'message-menu-btn';
        menuBtn.innerHTML = `
            <svg viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="3" r="1.5" fill="currentColor"/>
                <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
                <circle cx="8" cy="13" r="1.5" fill="currentColor"/>
            </svg>
        `;
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showReactionPicker(bubble);
        });
        actions.appendChild(menuBtn);
        bubble.appendChild(actions);

        // Add reaction picker
        const reactionPicker = document.createElement('div');
        reactionPicker.className = 'reaction-picker';
        const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
        reactions.forEach(emoji => {
            const btn = document.createElement('button');
            btn.className = 'reaction-option';
            btn.textContent = emoji;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.addReaction(messageId, emoji, type);
                this.hideReactionPicker(bubble);
            });
            reactionPicker.appendChild(btn);
        });
        bubble.appendChild(reactionPicker);

        // Add long-press support for mobile
        let pressTimer;
        bubble.addEventListener('touchstart', (e) => {
            pressTimer = setTimeout(() => {
                this.showReactionPicker(bubble);
            }, 500);
        });
        bubble.addEventListener('touchend', () => {
            clearTimeout(pressTimer);
        });
        bubble.addEventListener('touchmove', () => {
            clearTimeout(pressTimer);
        });

        // Add reactions container
        const reactionsContainer = document.createElement('div');
        reactionsContainer.className = 'message-reactions';
        reactionsContainer.dataset.messageId = messageId;

        const timeWrapper = document.createElement('div');
        timeWrapper.className = 'message-time-wrapper';
        
        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = this.formatTime(new Date());
        
        timeWrapper.appendChild(time);
        
        // Add seen indicator for sent messages
        if (type === 'sent') {
            const seenIndicator = document.createElement('span');
            seenIndicator.className = 'message-seen-indicator';
            seenIndicator.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 7L5 10L12 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
            timeWrapper.appendChild(seenIndicator);
        }

        content.appendChild(bubble);
        content.appendChild(reactionsContainer);
        content.appendChild(timeWrapper);
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);

        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    markMessageAsSeen(messageId) {
        const messageDiv = this.messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
        if (messageDiv) {
            const seenIndicator = messageDiv.querySelector('.message-seen-indicator');
            if (seenIndicator) {
                seenIndicator.classList.add('seen');
            }
        }
    }

    showSystemMessage(text, type = '') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `system-message ${type}`;
        
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('width', '16');
        icon.setAttribute('height', '16');
        icon.setAttribute('viewBox', '0 0 16 16');
        icon.setAttribute('fill', 'none');
        icon.innerHTML = `
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 4V8M8 11H8.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        `;

        const span = document.createElement('span');
        span.textContent = text;

        messageDiv.appendChild(icon);
        messageDiv.appendChild(span);
        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    handleTyping() {
        if (!this.isConnected || !this.connection || !this.connection.open || !this.isPeerReady()) return;

        // Send typing indicator only if not already sent (reduces network traffic while staying instant)
        if (!this.typingSent) {
            try {
                this.connection.send({ type: 'typing' });
                this.typingSent = true;
            } catch (error) {
                console.log('Failed to send typing indicator:', error);
            }
        }

        clearTimeout(this.typingTimer);
        this.typingTimer = setTimeout(() => {
            this.sendTypingStop();
        }, APP_CONFIG.TYPING_TIMEOUT);
    }

    sendTypingStop() {
        if (!this.isConnected || !this.connection || !this.connection.open || !this.isPeerReady()) return;

        try {
            this.connection.send({ type: 'stop-typing' });
            this.typingSent = false;
        } catch (error) {
            console.log('Failed to send stop typing:', error);
        }
    }

    showTypingIndicator() {
        this.typingIndicator.style.display = 'flex';
        clearTimeout(this.typingIndicatorTimer);
        this.typingIndicatorTimer = setTimeout(() => {
            this.hideTypingIndicator();
        }, APP_CONFIG.TYPING_TIMEOUT);
    }

    hideTypingIndicator() {
        this.typingIndicator.style.display = 'none';
    }

    handleConnectionClose(autoSearch = true) {
        if (!this.isConnected) return;

        // Check if stranger manually disconnected (clicked New Chat)
        if (this.strangerDisconnectedManually) {
            autoSearch = false;
            this.strangerDisconnectedManually = false;
        }

        this.isConnected = false;
        this.connection = null;
        this.messageInput.disabled = true;
        this.sendBtn.disabled = true;
        this.audioCallBtn.disabled = true;
        this.videoCallBtn.disabled = true;
        this.emojiBtn.disabled = true;
        this.closeEmojiPicker();
        this.hideTypingIndicator();
        this.connectionStatus.classList.remove('connected');
        
        if (this.isInCall) {
            this.endCall();
        }
        
        if (this.pendingCall) {
            this.pendingCall.close();
            this.pendingCall = null;
            this.incomingCallModal.style.display = 'none';
        }
        
        if (autoSearch) {
            // Auto-restart search for new stranger instantly
            this.connectionStatus.textContent = 'Searching...';
            this.isSearching = true;
            this.searchAttempts = 0;
            this.messagesContainer.innerHTML = '';
            this.showSearchingAnimation();
            this.showSystemMessage('Stranger disconnected. Looking for a new stranger...', 'error');
            this.updateStatus(true, 'Searching');
            
            // Set timeout to detect if search is taking too long
            this.startSearchFailureDetection();
            
            setTimeout(() => {
                this.initPeer();
                setTimeout(() => this.findStranger(), 50);
            }, 50);
        } else {
            // Don't auto-search, just show disconnected status
            this.showSystemMessage('Stranger has disconnected.', 'error');
            this.connectionStatus.textContent = 'Disconnected';
            this.isSearching = false;
            this.newChatBtn.style.display = 'flex';
            this.updateStatus(true, 'Ready');
        }
    }

    disconnect() {
        this.isSearching = false;
        this.isConnected = false;
        
        // Clear any waiting timeouts
        if (this.waitingTimeout) {
            clearTimeout(this.waitingTimeout);
            this.waitingTimeout = null;
        }
        
        // Clear reconnection timers
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectDelay = APP_CONFIG.RECONNECT_INITIAL_DELAY;
        
        // Clear search failure detection
        this.clearSearchFailureDetection();
        
        if (this.connection) {
            try {
                this.connection.removeAllListeners();
                this.connection.close();
            } catch (e) {
                console.log('Error closing connection:', e);
            }
            this.connection = null;
        }
        
        // Destroy peer to prevent any pending connections
        if (this.peer && !this.peer.destroyed) {
            try {
                this.peer.removeAllListeners();
                this.peer.destroy();
            } catch (e) {
                console.log('Error destroying peer:', e);
            }
        }

        this.messageInput.disabled = true;
        this.sendBtn.disabled = true;
        this.audioCallBtn.disabled = true;
        this.videoCallBtn.disabled = true;
        this.emojiBtn.disabled = true;
        this.newChatBtn.style.display = 'none';
        this.closeEmojiPicker();
        this.hideTypingIndicator();
        this.chatContainer.style.display = 'none';
        this.welcomeScreen.style.display = 'flex';
        this.updateStatus(true, 'Ready');
        
        if (this.isInCall) {
            this.endCall();
        }
    }

    startNewChat() {
        // Immediately mark as not connected and not searching to prevent race conditions
        const wasConnected = this.isConnected;
        this.isConnected = false;
        this.isSearching = false;
        
        // Clear any waiting timeouts
        if (this.waitingTimeout) {
            clearTimeout(this.waitingTimeout);
            this.waitingTimeout = null;
        }
        
        // Clear reconnection timers
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectDelay = APP_CONFIG.RECONNECT_INITIAL_DELAY;
        
        // Clear search failure detection
        this.clearSearchFailureDetection();
        
        // Send disconnect notification first
        if (this.connection && wasConnected) {
            try {
                this.connection.send({ type: 'stranger-disconnected' });
            } catch (e) {
                console.log('Could not send disconnect notification:', e);
            }
        }
        
        // Close connection and remove all listeners
        if (this.connection) {
            try {
                this.connection.removeAllListeners();
                this.connection.close();
            } catch (e) {
                console.log('Error closing connection:', e);
            }
            this.connection = null;
        }

        // End any active call
        if (this.isInCall) {
            this.endCall();
        }
        
        // Close pending calls
        if (this.pendingCall) {
            try {
                this.pendingCall.close();
            } catch (e) {}
            this.pendingCall = null;
        }
        
        // Hide call modals
        this.incomingCallModal.style.display = 'none';
        
        // Destroy old peer completely
        if (this.peer) {
            try {
                this.peer.removeAllListeners();
                if (!this.peer.destroyed) {
                    this.peer.destroy();
                }
            } catch (e) {
                console.log('Error destroying peer:', e);
            }
            this.peer = null;
        }

        // Update UI state
        this.messageInput.disabled = true;
        this.sendBtn.disabled = true;
        this.audioCallBtn.disabled = true;
        this.videoCallBtn.disabled = true;
        this.emojiBtn.disabled = true;
        this.newChatBtn.style.display = 'none';
        this.closeEmojiPicker();
        this.messagesContainer.innerHTML = '';
        this.connectionStatus.textContent = 'Searching...';
        this.connectionStatus.classList.remove('connected');
        this.hideTypingIndicator();
        this.showSearchingAnimation();
        this.updateStatus(true, 'Searching');
        
        // Show message if we were connected
        if (wasConnected) {
            this.showSystemMessage('Looking for a new stranger...', 'success');
        } else {
            this.showSystemMessage('Searching for a stranger...', 'success');
        }
        
        // Set timeout to detect if search is taking too long
        this.startSearchFailureDetection();

        // NOW mark as searching after everything is cleaned up
        this.isSearching = true;
        this.searchAttempts = 0;

        // Initialize new peer and start search immediately
        setTimeout(() => {
            if (this.isSearching) {
                this.initPeer();
                setTimeout(() => {
                    if (this.isSearching && !this.isConnected) {
                        this.findStranger();
                    }
                }, 50);
            }
        }, 30);
    }

    reconnect() {
        if (this.peer && !this.peer.destroyed && this.peer.disconnected) {
            try {
                this.peer.reconnect();
            } catch (e) {
                console.log('Reconnect error:', e);
            }
        }
    }

    updateStatus(online, text) {
        this.statusText.textContent = text;
        if (online) {
            this.statusBadge.classList.add('online');
        } else {
            this.statusBadge.classList.remove('online');
        }
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    formatTime(date) {
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    showSearchingAnimation() {
        // Remove any existing searching animation
        this.removeSearchingAnimation();
        
        const searchingDiv = document.createElement('div');
        searchingDiv.className = 'searching-animation';
        searchingDiv.id = 'searchingAnimation';
        searchingDiv.innerHTML = `
            <div class="searching-spinner">
                <div class="spinner-ring"></div>
                <div class="spinner-ring"></div>
                <div class="spinner-ring"></div>
            </div>
            <div class="searching-text">
                <span>Looking for a stranger</span>
                <div class="searching-dots">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                </div>
            </div>
        `;
        this.messagesContainer.appendChild(searchingDiv);
        this.scrollToBottom();
    }

    removeSearchingAnimation() {
        const existingAnimation = document.getElementById('searchingAnimation');
        if (existingAnimation) {
            existingAnimation.remove();
        }
    }

    startSearchFailureDetection() {
        // Clear any existing timeout
        this.clearSearchFailureDetection();
        
        // After 30 seconds of searching, show try again button
        this.searchFailedTimeout = setTimeout(() => {
            if (this.isSearching && !this.isConnected) {
                this.showSearchFailedMessage();
            }
        }, 30000); // Exactly 30 seconds
    }

    clearSearchFailureDetection() {
        if (this.searchFailedTimeout) {
            clearTimeout(this.searchFailedTimeout);
            this.searchFailedTimeout = null;
        }
    }

    showSearchFailedMessage() {
        this.isSearching = false;
        this.connectionStatus.textContent = 'Search Failed';
        this.removeSearchingAnimation();
        this.updateStatus(false, 'Search Failed');
        this.newChatBtn.style.display = 'flex';
        
        const failedDiv = document.createElement('div');
        failedDiv.className = 'search-failed-container';
        failedDiv.innerHTML = `
            <div class="search-failed-icon">
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-width="3"/>
                    <path d="M32 20V36M32 44H32.02" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                </svg>
            </div>
            <div class="search-failed-text">
                <h3>Unable to find a stranger</h3>
                <p>No one is available right now. Please try again.</p>
            </div>
            <button class="btn btn-primary retry-search-btn" id="retrySearchBtn">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M4 10C4 6.68629 6.68629 4 10 4C13.3137 4 16 6.68629 16 10C16 13.3137 13.3137 16 10 16C8.24021 16 6.6633 15.2053 5.60083 13.9467M4 10V6M4 10H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Retry Search
            </button>
        `;
        
        this.messagesContainer.appendChild(failedDiv);
        this.scrollToBottom();
        
        // Add click event to retry button
        const retryBtn = document.getElementById('retrySearchBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                this.retrySearch();
            });
        }
    }

    retrySearch() {
        // Remove failed message
        const failedContainer = document.querySelector('.search-failed-container');
        if (failedContainer) {
            failedContainer.remove();
        }
        
        // Restart search
        this.isSearching = true;
        this.searchAttempts = 0;
        this.connectionStatus.textContent = 'Searching...';
        this.showSearchingAnimation();
        this.updateStatus(true, 'Searching');
        
        // Set timeout to detect if search is taking too long
        this.startSearchFailureDetection();
        
        // Reinitialize peer and start searching
        this.initPeer();
        setTimeout(() => {
            this.findStranger();
        }, 1000);
    }

    initEmojiPicker() {
        const emojis = {
            smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '😎', '🤓', '🧐'],
            gestures: ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '💪', '🦾', '🦵', '🦿', '🦶'],
            hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '❤️‍🔥', '❤️‍🩹', '💋', '💌', '💐', '🌹', '🥀', '🌺', '🌷', '🌸', '💮', '🏵️', '🌻', '🌼'],
            symbols: ['✨', '⭐', '🌟', '💫', '⚡', '🔥', '💥', '💯', '✔️', '✅', '❌', '❎', '➕', '➖', '✖️', '➗', '©️', '®️', '™️', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔺', '🔻', '🔶', '🔷', '🔸', '🔹', '💠', '🎵', '🎶', '🎤', '🎧', '📢', '🔔', '🔕', '🎁', '🎉', '🎊', '🎈', '🎀', '🏆', '🥇', '🥈', '🥉']
        };

        this.currentCategory = 'smileys';
        this.emojis = emojis;
        this.renderEmojis('smileys');

        const categoryButtons = document.querySelectorAll('.emoji-category');
        categoryButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                categoryButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const category = btn.dataset.category;
                this.renderEmojis(category);
            });
        });
    }

    renderEmojis(category) {
        this.emojiPickerContent.innerHTML = '';
        const emojis = this.emojis[category] || [];
        
        emojis.forEach(emoji => {
            const emojiBtn = document.createElement('button');
            emojiBtn.className = 'emoji-item';
            emojiBtn.textContent = emoji;
            emojiBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.insertEmoji(emoji);
            });
            this.emojiPickerContent.appendChild(emojiBtn);
        });
    }

    toggleEmojiPicker() {
        if (this.emojiPicker.style.display === 'none' || this.emojiPicker.style.display === '') {
            // Get the position of the emoji button
            const emojiBtn = this.emojiBtn.getBoundingClientRect();
            const pickerHeight = 350;
            const pickerWidth = 320;
            
            // Calculate position
            let top = emojiBtn.top - pickerHeight - 10;
            let left = emojiBtn.left - pickerWidth + emojiBtn.width;
            
            // Adjust if picker would go off screen (top)
            if (top < 10) {
                top = emojiBtn.bottom + 10;
            }
            
            // Adjust if picker would go off screen (left)
            if (left < 10) {
                left = 10;
            }
            
            // Adjust if picker would go off screen (right)
            if (left + pickerWidth > window.innerWidth - 10) {
                left = window.innerWidth - pickerWidth - 10;
            }
            
            this.emojiPicker.style.top = `${top}px`;
            this.emojiPicker.style.left = `${left}px`;
            this.emojiPicker.style.display = 'flex';
        } else {
            this.closeEmojiPicker();
        }
    }

    closeEmojiPicker() {
        this.emojiPicker.style.display = 'none';
    }

    insertEmoji(emoji) {
        const cursorPos = this.messageInput.selectionStart;
        const textBefore = this.messageInput.value.substring(0, cursorPos);
        const textAfter = this.messageInput.value.substring(cursorPos);
        
        this.messageInput.value = textBefore + emoji + textAfter;
        this.messageInput.focus();
        
        const newCursorPos = cursorPos + emoji.length;
        this.messageInput.setSelectionRange(newCursorPos, newCursorPos);
    }

    initTheme() {
        const savedTheme = localStorage.getItem('chat-theme') || 'dark';
        this.themes = ['dark', 'light', 'ocean', 'sunset', 'forest', 'purple'];
        this.setTheme(savedTheme);
    }

    toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme') || 'dark';
        const currentIndex = this.themes.indexOf(currentTheme);
        const nextIndex = (currentIndex + 1) % this.themes.length;
        const newTheme = this.themes[nextIndex];
        this.setTheme(newTheme);
    }

    setTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('chat-theme', theme);
        this.updateThemeIcon(theme);
        this.showThemeNotification(theme);
    }

    showThemeNotification(theme) {
        const themeNames = {
            'dark': 'Dark Mode',
            'light': 'Light Mode',
            'ocean': 'Ocean Theme',
            'sunset': 'Sunset Theme',
            'forest': 'Forest Theme',
            'purple': 'Purple Theme'
        };
        
        // Remove any existing notification
        const existing = document.querySelector('.theme-notification');
        if (existing) existing.remove();
        
        const notification = document.createElement('div');
        notification.className = 'theme-notification';
        notification.textContent = themeNames[theme];
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 1500);
    }

    updateThemeIcon(theme) {
        const icons = {
            'dark': `<circle cx="10" cy="10" r="4" stroke="currentColor" stroke-width="2"/><path d="M10 2V4M10 16V18M18 10H16M4 10H2M15.5 4.5L14 6M6 14L4.5 15.5M15.5 15.5L14 14M6 6L4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
            'light': `<path d="M10 3C10 3 8 3 8 5C8 7 10 7 10 7C10 7 10 5 12 5C14 5 14 7 14 7C14 7 16 7 16 5C16 3 14 3 14 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 10C6.68629 10 4 12.6863 4 16C4 19.3137 6.68629 22 10 22C13.3137 22 16 19.3137 16 16C16 12.6863 13.3137 10 10 10Z" fill="currentColor"/>`,
            'ocean': `<path d="M2 12C2 12 4 10 6 10C8 10 8 12 10 12C12 12 12 10 14 10C16 10 18 12 18 12M2 16C2 16 4 14 6 14C8 14 8 16 10 16C12 16 12 14 14 14C16 14 18 16 18 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
            'sunset': `<circle cx="10" cy="10" r="4" fill="currentColor"/><path d="M2 14L18 14M3 17L17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
            'forest': `<path d="M10 2L6 8H14L10 2ZM10 7L7 12H13L10 7ZM10 11L8 14H12L10 11ZM10 14V18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
            'purple': `<path d="M10 2L12 8L18 8L13 12L15 18L10 14L5 18L7 12L2 8L8 8L10 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
        };
        
        this.themeIcon.innerHTML = icons[theme] || icons['dark'];
    }

    initMessageColor() {
        const savedColor = localStorage.getItem('message-color') || 'default';
        this.messageColor = savedColor;
        
        const colorOptions = document.querySelectorAll('.color-option');
        colorOptions.forEach(option => {
            option.addEventListener('click', () => {
                const color = option.dataset.color;
                this.setMessageColor(color);
                this.closeColorPickerModal();
            });
            
            if (option.dataset.color === savedColor) {
                option.classList.add('active');
            }
        });
    }

    openColorPicker() {
        this.messageColorModal.style.display = 'flex';
    }

    closeColorPickerModal() {
        this.messageColorModal.style.display = 'none';
    }

    setMessageColor(color) {
        this.messageColor = color;
        localStorage.setItem('message-color', color);
        
        const colorOptions = document.querySelectorAll('.color-option');
        colorOptions.forEach(option => {
            option.classList.remove('active');
            if (option.dataset.color === color) {
                option.classList.add('active');
            }
        });
        
        const colorGradients = {
            'default': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            'blue': 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            'green': 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            'red': 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            'orange': 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
            'pink': 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
            'cyan': 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
            'yellow': 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
            'indigo': 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            'teal': 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
            'violet': 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            'rose': 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)'
        };
        
        document.documentElement.style.setProperty('--message-sent-custom', colorGradients[color]);
        
        // Show notification
        this.showThemeNotification(`${color.charAt(0).toUpperCase() + color.slice(1)} Message Color`);
    }

    async initiateCall(type) {
        if (this.isInCall || !this.isConnected) {
            if (!this.isConnected) {
                this.showSystemMessage('Not connected to stranger', 'error');
            }
            return;
        }

        // Verify peer and connection are valid
        if (!this.peer || this.peer.destroyed || !this.connection || !this.connection.open) {
            this.showSystemMessage('Connection not ready', 'error');
            return;
        }

        this.callType = type;

        try {
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000,
                    channelCount: 1
                },
                video: type === 'video' ? {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 24, max: 30 }
                } : false
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

            this.callModal.style.display = 'flex';
            this.callTitle.textContent = type === 'video' ? 'Video Call' : 'Voice Call';
            this.callStatus.textContent = 'Calling...';

            if (type === 'video') {
                this.videoContainer.style.display = 'block';
                this.callAvatar.style.display = 'none';
                this.localVideo.srcObject = this.localStream;
                this.localVideo.muted = true;
                this.toggleVideoBtn.style.display = 'block';
            } else {
                this.videoContainer.style.display = 'none';
                this.callAvatar.style.display = 'flex';
                this.toggleVideoBtn.style.display = 'none';
            }

            if (this.connection && this.connection.open) {
                try {
                    this.connection.send({
                        type: 'call-request',
                        callType: type
                    });
                } catch (e) {
                    console.log('Failed to send call request:', e);
                }
            }

            this.mediaConnection = this.peer.call(this.connection.peer, this.localStream);
            
            if (!this.mediaConnection) {
                throw new Error('Failed to create media connection');
            }
            this.isInCall = true;
            
            // Disable call buttons during the call
            this.audioCallBtn.disabled = true;
            this.videoCallBtn.disabled = true;

            this.mediaConnection.on('stream', (remoteStream) => {
                this.handleIncomingStream(remoteStream);
            });

            this.mediaConnection.on('error', (err) => {
                console.error('Media connection error:', err);
                this.showSystemMessage('Call connection error', 'error');
                this.endCall();
            });

            this.mediaConnection.on('close', () => {
                console.log('Media connection closed');
                if (this.isInCall) {
                    this.showSystemMessage('Call ended', 'error');
                    this.cleanupCallState();
                }
            });

            this.mediaConnection.on('iceStateChanged', (state) => {
                console.log('Media ICE state:', state);
                // Only end call on 'closed', not 'failed' (failed can recover)
                if (state === 'closed') {
                    this.showSystemMessage('Call connection lost', 'error');
                    this.endCall();
                }
                // For 'failed' state, let it attempt to recover
                if (state === 'failed') {
                    console.log('ICE connection failed, attempting recovery...');
                    this.callStatus.textContent = 'Reconnecting...';
                }
                if (state === 'connected' || state === 'completed') {
                    this.callStatus.textContent = 'Connected';
                }
            });

            this.startCallDuration();

        } catch (error) {
            const errorMsg = type === 'video' ? 'Failed to access camera/microphone' : 'Failed to access microphone';
            this.showSystemMessage(errorMsg, 'error');
            this.cleanupCallState();
        }
    }

    handleIncomingStream(stream) {
        this.remoteStream = stream;
        this.callStatus.textContent = 'Connected';
        
        // Check if stream has video tracks
        const hasVideo = stream.getVideoTracks().length > 0;
        
        if (hasVideo && this.callType === 'video') {
            // Video call - display video (audio is included in video element)
            this.remoteVideo.srcObject = stream;
            this.remoteVideo.muted = false;
            this.remoteVideo.play().catch(error => {
                console.error('Error playing remote video:', error);
            });
        } else {
            // Audio call - play audio only
            const remoteAudio = new Audio();
            remoteAudio.srcObject = stream;
            remoteAudio.autoplay = true;
            remoteAudio.volume = 1.0;
            remoteAudio.play().catch(error => {
                console.error('Error playing remote audio:', error);
            });
            this.remoteAudioElement = remoteAudio;
        }
    }

    toggleMute() {
        if (!this.localStream) return;

        this.isMuted = !this.isMuted;
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = !this.isMuted;
        });

        if (this.isMuted) {
            this.toggleMuteBtn.classList.add('muted');
        } else {
            this.toggleMuteBtn.classList.remove('muted');
        }
    }

    toggleVideo() {
        if (!this.localStream || this.callType !== 'video') return;

        this.isVideoOff = !this.isVideoOff;
        this.localStream.getVideoTracks().forEach(track => {
            track.enabled = !this.isVideoOff;
        });

        if (this.isVideoOff) {
            this.toggleVideoBtn.classList.add('off');
        } else {
            this.toggleVideoBtn.classList.remove('off');
        }
    }



    startCallDuration() {
        this.callStartTime = Date.now();
        this.callDurationInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            this.callDuration.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }

    cleanupCallState() {
        // Important: Reset isInCall FIRST to prevent race conditions
        this.isInCall = false;
        
        // Close media connection and remove listeners
        if (this.mediaConnection) {
            try {
                this.mediaConnection.removeAllListeners();
                this.mediaConnection.close();
            } catch (e) {}
            this.mediaConnection = null;
        }

        // Stop all local stream tracks
        if (this.localStream) {
            try {
                this.localStream.getTracks().forEach(track => track.stop());
            } catch (e) {}
            this.localStream = null;
        }

        // Stop all remote stream tracks
        if (this.remoteStream) {
            try {
                this.remoteStream.getTracks().forEach(track => track.stop());
            } catch (e) {}
            this.remoteStream = null;
        }

        // Clean up remote audio element for audio-only calls
        if (this.remoteAudioElement) {
            try {
                this.remoteAudioElement.pause();
                this.remoteAudioElement.srcObject = null;
            } catch (e) {}
            this.remoteAudioElement = null;
        }

        // Clear call duration timer
        if (this.callDurationInterval) {
            clearInterval(this.callDurationInterval);
            this.callDurationInterval = null;
        }

        // Clear any pending call
        if (this.pendingCall) {
            try {
                this.pendingCall.close();
            } catch (e) {}
            this.pendingCall = null;
        }

        // Reset call UI and state
        this.callModal.style.display = 'none';
        this.incomingCallModal.style.display = 'none';
        this.isMuted = false;
        this.isVideoOff = false;
        this.callType = null;
        this.callStartTime = null;
        
        if (this.toggleMuteBtn) {
            this.toggleMuteBtn.classList.remove('muted');
        }
        
        if (this.toggleVideoBtn) {
            this.toggleVideoBtn.classList.remove('off');
            this.toggleVideoBtn.style.display = 'none';
        }
        
        // Reset call duration display
        if (this.callDuration) {
            this.callDuration.textContent = '00:00';
        }
        
        // Re-enable call buttons
        if (this.audioCallBtn && this.isConnected) {
            this.audioCallBtn.disabled = false;
        }
        if (this.videoCallBtn && this.isConnected) {
            this.videoCallBtn.disabled = false;
        }
    }

    endCall() {
        // Show message that you ended the call
        this.showSystemMessage('You ended the call.', 'error');
        
        // Notify the other peer BEFORE cleanup (while isInCall is still true)
        if (this.connection && this.isConnected && this.isInCall) {
            try {
                this.connection.send({ type: 'call-end' });
            } catch (e) {}
        }
        
        // Clean up all call state
        this.cleanupCallState();
    }

    showReactionPicker(bubble) {
        // Hide any other open pickers
        document.querySelectorAll('.reaction-picker.show').forEach(picker => {
            picker.classList.remove('show');
        });

        const picker = bubble.querySelector('.reaction-picker');
        if (picker) {
            // Get bubble position
            const bubbleRect = bubble.getBoundingClientRect();
            const pickerHeight = 60; // Approximate picker height
            const pickerWidth = 280; // Approximate picker width
            
            // Calculate position
            let top = bubbleRect.top - pickerHeight - 8;
            let left = bubbleRect.left + (bubbleRect.width / 2) - (pickerWidth / 2);
            
            // Adjust if picker would go off screen
            if (top < 10) {
                // Show below if not enough space above
                top = bubbleRect.bottom + 8;
            }
            
            if (left < 10) {
                left = 10;
            } else if (left + pickerWidth > window.innerWidth - 10) {
                left = window.innerWidth - pickerWidth - 10;
            }
            
            // Set position
            picker.style.top = `${top}px`;
            picker.style.left = `${left}px`;
            picker.classList.add('show');
            
            // Close picker when clicking outside
            const closeHandler = (e) => {
                if (!bubble.contains(e.target) && !picker.contains(e.target)) {
                    this.hideReactionPicker(bubble);
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => {
                document.addEventListener('click', closeHandler);
            }, 100);
        }
    }

    hideReactionPicker(bubble) {
        const picker = bubble.querySelector('.reaction-picker');
        if (picker) {
            picker.classList.remove('show');
        }
    }

    addReaction(messageId, emoji, messageType) {
        if (!messageId || !this.connection || !this.isConnected) return;

        // Find the message's reactions container
        const reactionsContainer = this.messagesContainer.querySelector(`.message-reactions[data-message-id="${messageId}"]`);
        if (!reactionsContainer) return;

        // Check if user already reacted with this emoji
        const existingReaction = reactionsContainer.querySelector(`.reaction-item[data-emoji="${emoji}"]`);
        
        if (existingReaction) {
            // Toggle off the reaction
            const isUserReacted = existingReaction.classList.contains('user-reacted');
            if (isUserReacted) {
                const count = parseInt(existingReaction.querySelector('.reaction-count').textContent);
                if (count > 1) {
                    existingReaction.querySelector('.reaction-count').textContent = count - 1;
                    existingReaction.classList.remove('user-reacted');
                } else {
                    existingReaction.remove();
                }
                
                // Send remove reaction to peer
                if (this.connection && this.isConnected) {
                    try {
                        this.connection.send({
                            type: 'reaction-remove',
                            messageId: messageId,
                            emoji: emoji
                        });
                    } catch (e) {}
                }
            } else {
                // Add user's reaction to existing
                const count = parseInt(existingReaction.querySelector('.reaction-count').textContent);
                existingReaction.querySelector('.reaction-count').textContent = count + 1;
                existingReaction.classList.add('user-reacted');
                
                // Send reaction to peer
                if (this.connection && this.isConnected) {
                    try {
                        this.connection.send({
                            type: 'reaction',
                            messageId: messageId,
                            emoji: emoji
                        });
                    } catch (e) {}
                }
            }
        } else {
            // Create new reaction
            const reactionItem = document.createElement('div');
            reactionItem.className = 'reaction-item user-reacted';
            reactionItem.dataset.emoji = emoji;
            reactionItem.innerHTML = `
                <span class="reaction-emoji">${emoji}</span>
                <span class="reaction-count">1</span>
            `;
            
            // Click to remove own reaction
            reactionItem.addEventListener('click', () => {
                this.addReaction(messageId, emoji, messageType);
            });
            
            reactionsContainer.appendChild(reactionItem);
            
            // Send reaction to peer
            if (this.connection && this.isConnected) {
                try {
                    this.connection.send({
                        type: 'reaction',
                        messageId: messageId,
                        emoji: emoji
                    });
                } catch (e) {}
            }
        }
    }

    receiveReaction(messageId, emoji) {
        const reactionsContainer = this.messagesContainer.querySelector(`.message-reactions[data-message-id="${messageId}"]`);
        if (!reactionsContainer) return;

        const existingReaction = reactionsContainer.querySelector(`.reaction-item[data-emoji="${emoji}"]`);
        
        if (existingReaction) {
            const count = parseInt(existingReaction.querySelector('.reaction-count').textContent);
            existingReaction.querySelector('.reaction-count').textContent = count + 1;
        } else {
            const reactionItem = document.createElement('div');
            reactionItem.className = 'reaction-item';
            reactionItem.dataset.emoji = emoji;
            reactionItem.innerHTML = `
                <span class="reaction-emoji">${emoji}</span>
                <span class="reaction-count">1</span>
            `;
            reactionsContainer.appendChild(reactionItem);
        }
    }

    removeReaction(messageId, emoji) {
        const reactionsContainer = this.messagesContainer.querySelector(`.message-reactions[data-message-id="${messageId}"]`);
        if (!reactionsContainer) return;

        const existingReaction = reactionsContainer.querySelector(`.reaction-item[data-emoji="${emoji}"]`);
        
        if (existingReaction) {
            const count = parseInt(existingReaction.querySelector('.reaction-count').textContent);
            if (count > 1) {
                existingReaction.querySelector('.reaction-count').textContent = count - 1;
            } else {
                existingReaction.remove();
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new RandomChatApp();
});
