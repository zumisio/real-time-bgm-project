let model;
const video = document.getElementById('webcam');
const liveView = document.getElementById('liveView');
const enableWebcamButton = document.getElementById('webcamButton');
const stopWebcamButton = document.getElementById('stopWebcamButton');
const switchCameraButton = document.getElementById('switchCameraButton');
const detectionConsole = document.getElementById('detectionConsole');
const volumeSlider = document.getElementById('volumeSlider');
const volumeValue = document.getElementById('volumeValue');
const soundIndicator = document.getElementById('soundIndicator');
let children = [];
let stream = null;
let currentFacingMode = 'user';
let lastDetectionTime = 0;
let volume = 0.1;
let isDetecting = false;

// サイン音を作成
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const oscillator = audioContext.createOscillator();
const gainNode = audioContext.createGain();
oscillator.type = 'sine';
oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
oscillator.connect(gainNode);
gainNode.connect(audioContext.destination);
oscillator.start();
gainNode.gain.setValueAtTime(0, audioContext.currentTime);

volumeSlider.addEventListener('input', function() {
    volume = parseFloat(this.value);
    volumeValue.textContent = Math.round(volume * 100) + '%';
});

function playSignalTone() {
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0, audioContext.currentTime + 0.1);

    soundIndicator.classList.add('active');
    setTimeout(() => {
        soundIndicator.classList.remove('active');
    }, 100);
}

// モデルの読み込みを開始
cocoSsd.load().then(function (loadedModel) {
    model = loadedModel;
    enableWebcamButton.disabled = false;
}).catch(function(error) {
    console.error("モデルの読み込みに失敗しました:", error);
});

function hasGetUserMedia() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

if (hasGetUserMedia()) {
    enableWebcamButton.addEventListener('click', enableCam);
    stopWebcamButton.addEventListener('click', stopCam);
    switchCameraButton.addEventListener('click', switchCamera);
} else {
    console.warn('getUserMedia()はお使いのブラウザでサポートされていません');
    enableWebcamButton.disabled = true;
}

function resumeAudioContext() {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function enableCam(event) {
    if (!model) {
        console.log('モデルがまだ読み込まれていません。お待ちください。');
        return;
    }
    
    enableWebcamButton.classList.add('hidden');
    stopWebcamButton.classList.remove('hidden');
    switchCameraButton.classList.remove('hidden');
    
    resumeAudioContext();
    startCamera();
}

function startCamera() {
    if (stream) {
        stopCameraStream();
    }

    const constraints = {
        video: { facingMode: currentFacingMode }
    };

    navigator.mediaDevices.getUserMedia(constraints).then(function(s) {
        stream = s;
        video.srcObject = stream;
        video.addEventListener('loadeddata', predictWebcam);
    }).catch(function(error) {
        console.error("カメラの開始に失敗しました: ", error);
    });
}

function stopCameraStream() {
    if (stream) {
        stream.getTracks().forEach(track => {
            track.stop();
        });
    }
    video.srcObject = null;
    stream = null;
}

function stopCam() {
    stopCameraStream();
    isDetecting = false;

    for (let i = 0; i < children.length; i++) {
        liveView.removeChild(children[i]);
    }
    children.splice(0);
    detectionConsole.innerHTML = '';

    stopWebcamButton.classList.add('hidden');
    enableWebcamButton.classList.remove('hidden');
    switchCameraButton.classList.add('hidden');
}

function switchCamera() {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    startCamera();
}

function predictWebcam() {
    if (!stream) return;  // ストリームがない場合は処理を中止

    if (isDetecting) {
        requestAnimationFrame(predictWebcam);
        return;
    }
    isDetecting = true;

    const videoWidth = video.offsetWidth;
    const videoHeight = video.offsetHeight;
    const actualVideoWidth = video.videoWidth;
    const actualVideoHeight = video.videoHeight;
    const scaleX = videoWidth / actualVideoWidth;
    const scaleY = videoHeight / actualVideoHeight;

    model.detect(video).then(function (predictions) {
        for (let i = 0; i < children.length; i++) {
            liveView.removeChild(children[i]);
        }
        children.splice(0);
        
        let detectedObjects = false;
        for (let n = 0; n < predictions.length; n++) {
            if (predictions[n].score > 0.66) {
                detectedObjects = true;
                const highlighter = document.createElement('div');
                highlighter.setAttribute('class', 'highlighter');
                
                const left = predictions[n].bbox[0] * scaleX;
                const top = predictions[n].bbox[1] * scaleY;
                const width = predictions[n].bbox[2] * scaleX;
                const height = predictions[n].bbox[3] * scaleY * 2.0; // 高さ

                highlighter.style = `left: ${left}px; top: ${top - height * 0.1}px; width: ${width}px; height: ${height}px;`;

                const p = document.createElement('p');
                p.innerText = predictions[n].class  + ' - ' 
                    + Math.round(parseFloat(predictions[n].score) * 100) 
                    + '%';

                highlighter.appendChild(p);
                liveView.appendChild(highlighter);
                
                children.push(highlighter);

                addToConsole(predictions[n].class, predictions[n].score);
            }
        }

        const currentTime = Date.now();
        if (detectedObjects && currentTime - lastDetectionTime > 1000) {
            playSignalTone();
            lastDetectionTime = currentTime;
        }
        
        isDetecting = false;
        if (stream) {
            requestAnimationFrame(predictWebcam);
        }
    });
}

function addToConsole(className, score) {
    const consoleItem = document.createElement('div');
    consoleItem.className = 'console-item';
    consoleItem.textContent = `${className} - ${Math.round(score * 100)}%`;
    detectionConsole.insertBefore(consoleItem, detectionConsole.firstChild);

    while (detectionConsole.children.length > 5) {
        detectionConsole.removeChild(detectionConsole.lastChild);
    }
}
