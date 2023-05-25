const Joi = require('joi');
const HyperExpress = require('hyper-express');
const portAudio = require('naudiodon');
const { verifyRequest } = require('@middleware/verifyRequest');
const { limiter } = require('@middleware/limiter');
const { timetable } = require('@lib/postgres');
const fs = require('fs');
const audio = require('@lib/audio_utls');
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

    // Set the sample rate to the default sample rate of the device
    let sampleRate = audio.getDefaultSampleRate(portAudio.getDevices(), audio_config.device);

    // This is the size of the buffer that will be filled when calling read()
    let frameSize = audio.calculateFrameSize(sampleRate, audio_config.targetFPS);

    console.log(sampleRate, frameSize, audio_config.device)

    inAudio = portAudio.AudioIO({
        inOptions: {
            channelCount: 1,
            sampleFormat: portAudio.SampleFormat16Bit,
            sampleRate: sampleRate,
            highwaterMark: frameSize,
            deviceId: audio_config.device,
            closeOnError: true // Close the stream if an audio error is detected, if set false then just log the error
        }
    });


    //Start streaming
    inAudio.on('data', buffer => {
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
});

/* Plugin info*/
const PluginName = 'AudioHost'; //This plugins name
const PluginRequirements = []; //Put your Requirements and version here <Name, not file name>|Version
const PluginVersion = '0.0.1'; //This plugins version

const postDevicesSchema = Joi.object().keys({
    device: Joi.number().integer().min(0).max(99).required(),
    type: Joi.string().valid('input', 'output').required(),
});

const postModeSchema = Joi.object().keys({
    WebstreamingMode: Joi.number().min(0).max(5).required(),
    DeviceStreamingMode: Joi.number().min(0).max(5).required(),
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

    inAudio.stop();

    // Set the sample rate to the default sample rate of the device
    sampleRate = audio.getDefaultSampleRate(portAudio.getDevices(), value.device);

    // This is the size of the buffer that will be filled when calling read()
    frameSize = audio.calculateFrameSize(sampleRate, audio_config.targetFPS);

    inAudio = portAudio.AudioIO({
        inOptions: {
            channelCount: 1,
            sampleFormat: portAudio.SampleFormat16Bit,
            sampleRate: sampleRate,
            highwaterMark: frameSize,
            deviceId: audio_config.device,
            closeOnError: true // Close the stream if an audio error is detected, if set false then just log the error
        }
    });

    inAudio.start();

    res.status(200);
    res.send(`OK`)
});

router.get('mode', verifyRequest('web.api.audio.mode.read'), async (req, res) => {
    res.status(200);
    res.json({ WebstreamingMode: audio_config.WebstreamingMode, DeviceStreamingMode: audio_config.DeviceStreamingMode });
});

router.post('mode', verifyRequest('web.api.audio.mode.write'), async (req, res) => {
    const value = await postModeSchema.validateAsync(await req.json());
    if (!value) throw new InvalidRouteInput('Invalid Route Input');
    if (value.WebstreamingMode) audio_config.WebstreamingMode = value.WebstreamingMode;
    if (value.DeviceStreamingMode) audio_config.DeviceStreamingMode = value.DeviceStreamingMode;
    fs.writeFile('./config/audio.json', JSON.stringify(audio_config), (err) => {
        if (err) throw err;
    });
    res.status(200);
    res.send(`OK`)
});

module.exports = {
    router: router,
    PluginName: PluginName,
    PluginRequirements: PluginRequirements,
    PluginVersion: PluginVersion,
};