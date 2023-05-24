// This is to increase the resolution of the FFT algorithm
const zeroPaddingFactor = 4; // Extra PADDING

// This is the highest frequency we will process (Hz)
const maxFrequency = 20000;

/**
 * Function to get the default sample rate for a given device id.
 *
 * @param {Array} devices The array of device objects.
 * @param {number} id The id of the device.
 * @return {number|null} The default sample rate of the device with the given id, or null if no such device is found.
 */
function getDefaultSampleRate(devices, id) {
    for (let i = 0; i < devices.length; i++) {
        if (devices[i].id === id) {
            return devices[i].defaultSampleRate;
        }
    }
    return null;
}

/**
 * Function to calculate the frame size for a given frames per second (FPS).
 *
 * @param {number} sampleRate The sample rate of the audio input.
 * @param {number} fps The desired frames per second.
 * @return {number} The frame size that would result in the desired FPS.
 */
function calculateFrameSize(sampleRate, fps) {
    let frameSize = sampleRate / fps;

    // If frameSize is below 1024, set it to 1024
    if (frameSize < 1024) {
        frameSize = 1024;
    } else {
        // If frameSize is not a power of 2, round up to the next power of 2
        frameSize = Math.pow(2, Math.ceil(Math.log(frameSize) / Math.log(2)));
    }

    return frameSize;
}

/**
 * Function to calculate frequency ranges for each bin.
 *
 * @param {number} numBins The number of bins.
 * @param {number} [minFreq=20] The minimum frequency.
 * @param {number} maxFreq The maximum frequency.
 * @return {Array} An array of frequency ranges for each bin.
 */
function BinsfrequencyRanges(numBins, minFreq = 20, maxFreq = maxFrequency) {
    let minLog = Math.log10(minFreq);
    let maxLog = Math.log10(maxFreq);
    let binSize = (maxLog - minLog) / numBins;

    let ranges = new Array(numBins).fill(0).map((_, index) => {
        return [
            Math.pow(10, (index * binSize + minLog)),
            Math.pow(10, ((index + 1) * binSize + minLog))
        ];
    });

    return ranges;
}

/**
 * Function to calculate amplitudes for each bin.
 *
 * @param {Array} frequencies The frequencies from the FFT.
 * @param {Array} amplitudes The amplitudes from the FFT.
 * @param {number} numBins The number of bins.
 * @param {number} [minFreq=20] The minimum frequency.
 * @param {number} maxFreq The maximum frequency.
 * @return {Array} An array of total amplitudes for each bin.
 */
function Binsamplitudes(frequencies, amplitudes, numBins, minFreq = 20, maxFreq = maxFrequency) {
    let minLog = Math.log10(minFreq);
    let maxLog = Math.log10(maxFreq);
    let binSize = (maxLog - minLog) / numBins;

    let binAmplitudes = new Array(numBins).fill(0);

    for (let i = 0; i < frequencies.length; i++) {
        if (frequencies[i] < minFreq || frequencies[i] > maxFreq) continue;

        let binIndex = Math.floor((Math.log10(frequencies[i]) - minLog) / binSize);
        if (binIndex >= numBins) binIndex = numBins - 1;

        binAmplitudes[binIndex] += amplitudes[i];
    }

    return binAmplitudes;
}

/**
 * Function to calculate average and dominant frequency.
 *
 * @param {Array} frequencies The frequencies from the FFT.
 * @param {Array} amplitudes The amplitudes from the FFT.
 * @param {number} [amplitudeThreshold=50] The minimum amplitude to consider.
 * @return {Object} An object with the average and dominant frequencies.
 */
function getAverageAndDominantFrequency(frequencies, amplitudes, amplitudeThreshold = 50) {
    let totalFrequency = 0;
    let totalAmplitude = 1;
    let dominantFrequency = { frequency: 0, amplitude: 0 };

    for (let i = 0; i < frequencies.length; i++) {
        // If the current amplitude is greater than the current dominant amplitude,
        // then this frequency becomes the new dominant frequency
        if (amplitudes[i] > dominantFrequency.amplitude) {
            dominantFrequency = { frequency: frequencies[i], amplitude: amplitudes[i] };
        }

        // Ignore frequencies with small amplitudes
        if (amplitudes[i] <= amplitudeThreshold) {
            continue;
        }

        totalFrequency += frequencies[i] * amplitudes[i];
        totalAmplitude += amplitudes[i];
    }

    let averageFrequency = totalFrequency / totalAmplitude;

    return { averageFrequency, dominantFrequency };
}

/**
 * Function to find the closest note to a given frequency.
 *
 * @param {number} frequency The frequency to match to a note.
 * @return {string} The note closest to the given frequency.
 */
function findClosestNote(frequency) {
    if (frequency === 0) return 'A0';
    const A4 = 440;

    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    // Calculate how many semitones this frequency is from A4
    let semitonesFromA4 = Math.round(12 * Math.log2(frequency / A4));

    // Calculate the octave and the note within the octave
    let octave = Math.floor(semitonesFromA4 / 12) + 4;
    let noteIndex = semitonesFromA4 % 12;
    if (noteIndex < 0) {
        noteIndex += 12;
        octave--;
    }

    // Get the note name
    let noteName = noteNames[noteIndex];

    // Construct the full note name
    let fullNoteName = noteName + octave.toString();

    return fullNoteName;
}

module.exports = {
    getDefaultSampleRate,
    calculateFrameSize,
    analyzer: {
        amplitudes: Binsamplitudes,
        ranges: BinsfrequencyRanges
    },
    getAverageAndDominantFrequency,
    findClosestNote
}