export class AudioEngine {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.listener = this.audioContext.listener;
        this.panningModel = 'HRTF';
        this.distanceModel = 'linear';
        this.maxDistance = 10000;
        this.refDistance = 0.01;
        this.rollOff = 10;

        this.lastPlayedRank = -1;
        this.currentlyPlaying = 0;
        this.nodeNumber = 0;
        this.audioDuration = 5;

    }

    playNextInQueue(n, nearestAudioPoints, guiParameters) {
        if (nearestAudioPoints.length &&
            this.currentlyPlaying < Math.min(guiParameters.maxSimultaneous, nearestAudioPoints.length) &&
            this.nodeNumber == n) {
            const attemptingToPlay = (this.lastPlayedRank + 1) % nearestAudioPoints.length;
            const point = nearestAudioPoints[attemptingToPlay][0];
            const idx = point[2];
            this.playAudio("https://wanderingmind.thomasjuldo.com/audiostream/static/audio/", idx, point, guiParameters);
        }
    }


    // Function to play the audio from a given URL
    playAudio(url, index, point, guiParameters) {
        url = url + `${index}`;

        if (this.currentlyPlaying >= guiParameters.maxSimultaneous) return;
        this.currentlyPlaying += 1;
        this.lastPlayedRank += 1;

        // Use fetch to retrieve the audio file
        fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.arrayBuffer(); // Convert the response to an ArrayBuffer
            })
            .then(arrayBuffer => {
            // Decode the audio data into an audio buffer
            return this.audioContext.decodeAudioData(arrayBuffer);
            })
            .then(audioBuffer => {
            // Create an AudioBufferSourceNode
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            const panner = new PannerNode(this.audioContext, {
                panningModel: this.panningModel,
                distanceModel: this.distanceModel,
                positionX: point[0],
                positionY: 0,
                positionZ: point[1],
                orientationX: 0,
                orientationY: 0,
                orientationZ: 0,
                refDistance: this.refDistance,
                maxDistance: this.maxDistance,
                rolloffFactor: this.rollOff,
            });
            source.connect(panner);
            panner.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            let start = this.audioContext.currentTime;
            let end = start + this.audioDuration;
            let fadeDuration = 0.5;
            let maxGain = guiParameters.volume;
            gainNode.gain.linearRampToValueAtTime(0.01, start);
            gainNode.gain.linearRampToValueAtTime(maxGain, start + fadeDuration);
            gainNode.gain.linearRampToValueAtTime(maxGain, end - fadeDuration);
            gainNode.gain.linearRampToValueAtTime(0.01, end);
            source.buffer = audioBuffer;


            source.onended = () => {
                this.currentlyPlaying -= 1;
            }

            // Start the playback
            source.start();
        }) .catch(e => {
            this.currentlyPlaying -= 1;
        });
    }
}
