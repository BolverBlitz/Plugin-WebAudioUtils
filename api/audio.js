const Joi = require('joi');
const HyperExpress = require('hyper-express');
const portAudio = require('naudiodon');
const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { timetable } = require('@lib/postgres');
const fs = require('fs');
const { InvalidRouteInput } = require('@lib/errors');
const router = new HyperExpress.Router();

let inAudio; // Global variable for the audio input stream
let audio_config = {}; // Global variable for the audio config

// Read the audio config file
fs.readFile('./config/audio.json', 'utf8', (err, data) => {
    if (err) {
        process.log.error(err);
        return;
    }
    audio_config = JSON.parse(data);
});

const targetFPS = 30;

/* Plugin info*/
const PluginName = 'AudioHost'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const postDevicesSchema = Joi.object().keys({
    device: Joi.number().integer().min(0).max(99).required(),
    type: Joi.string().valid('input', 'output').required(),
});

router.get('/devices', verifyRequest('web.api.audio.devices.read'), async (req, res) => {
    const audioDevices = portAudio.getDevices()
    res.status(200);
    res.send({
        inputDevices: audioDevices.filter(device => device.maxInputChannels > 0),
        outputDevices: audioDevices.filter(device => device.maxOutputChannels > 0)
    })
});

router.post('/devices', verifyRequest('web.api.audio.devices.write'), async (req, res) => {
    const value = await postDevicesSchema.validateAsync(await req.json());
    if (!value) throw new InvalidRouteInput('Invalid Route Input');
    if (value.type === 'output') throw new InvalidRouteInput('Output devices are not supported yet');

    audioIn.stop();

    // Set the sample rate to the default sample rate of the device
    const sampleRate = getDefaultSampleRate(value.device, 0);

    // This is the size of the buffer that will be filled when calling read()
    const frameSize = calculateFrameSize(sampleRate, targetFPS);

    inAudio = portAudio.AudioIO({
        inOptions: {
            channelCount: 1,
            sampleFormat: portAudio.SampleFormat16Bit,
            sampleRate: sampleRate,
            highwaterMark: frameSize,
            deviceId: value.device,
            closeOnError: true // Close the stream if an audio error is detected, if set false then just log the error
        }
    });

    audioIn.start();

    res.status(200);
    res.send(`OK`)
});

//Start streaming
audioIn.on('data', buffer => {
    let data = [];
    for (let i = 0; i < buffer.length; i += 2) {
        // Convert 16 bit value to float (-1 to 1)
        data.push(buffer.readInt16LE(i) / 32767);
    }

    // Zero-pad the data to increase the hz resolution of the FFT Algorithm
    let paddedDataSize = data.length * zeroPaddingFactor;
    while (data.length < paddedDataSize) {
        data.push(0);
    }

    let phasors = fft(data);

    // Get frequencies and amplitudes and get rid of higher frequencies than maxFrequency
    const frequencies = fftUtil.fftFreq(phasors, sampleRate).filter((freq, index) => freq <= maxFrequency);
    const amplitudes = fftUtil.fftMag(phasors).filter((amp, index) => frequencies[index] <= maxFrequency);
});

inAudio.on('error', err => {
    process.log.error(err);
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};