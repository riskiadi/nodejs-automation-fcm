var fs = require('fs');
var readline = require('readline');
var { google } = require('googleapis');
var OAuth2 = google.auth.OAuth2;
const date = require('date-and-time');
var kill = require('tree-kill');
const util = require("util");
const admin = require("firebase-admin");
const serviceAccount = require('./firebase_key.json');
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require("nodemailer");
var tcpp = require('tcp-ping');
var cron = require('node-cron');
const exec = util.promisify(require("child_process").exec);
const execWithoutPromis = require("child_process").exec;
const spawn = require("child_process").spawn;


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://manyaran-sistem.firebaseio.com"
});

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/youtube-nodejs-quickstart.json
var SCOPES = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.channel-memberships.creator',
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtubepartner',
    'https://www.googleapis.com/auth/youtubepartner-channel-audit'
];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + '/nodejs_scripts/smart_doorbell/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'youtube_auth.json';

var now = new Date();
var unixNow = Math.round((now.getTime()/1000) + (3600*7));
var year = date.format(now, 'YYYY');
var month = date.format(now, 'MM');
var day = date.format(now, 'DD');
var hour = date.format(now, 'HH');
var minute = date.format(now, 'mm');
var second = date.format(now, 'ss');

var storedYoutubeToken;
var ipClient = "";
let streamProcess;
let streamStartCron;
let streamEndCron;

const authorizationPwd = "riskiadi+";

const database = admin.database();
const storage = admin.storage();
const messaging = admin.messaging();

const hardware = {
    BELL: 'bell',
    BUTTON: 'button',
}

const app = express();
const router = express.Router();
const port = 2021;
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(function (req, res, next) {
    now = new Date();
    unixNow = Math.round((now.getTime()/1000) + (3600*7));
    year = date.format(now, 'YYYY');
    month = date.format(now, 'MM');
    day = date.format(now, 'DD');
    hour = date.format(now, 'HH');
    minute = date.format(now, 'mm');
    second = date.format(now, 'ss');
    ipClient = req.ip;
    if(req.headers.authorization === authorizationPwd) {
        return next()
    }
    if(req.headers.authorization != authorizationPwd && req.headers.authorization != undefined) {
        res.status(401).json({
            status: {
                code: 401,
                message: "authorization denied.",
            }
        });
    }else{
        res.status(401).json({
            status: {
                code: 401,
                message: "authorization required.",
            }
        });
    }

});

/**
   * Create an OAuth2 client with the given credentials, and then execute the
   * given callback function.
   *
   * @param {Object} credentials The authorization client credentials.
   * @param {function} callback The callback to call with the authorized client.
   */
function authorize(credentials, callback) {
    var clientSecret = credentials.installed.client_secret;
    var clientId = credentials.installed.client_id;
    var redirectUrl = credentials.installed.redirect_uris[0];
    var oauth2Client = new OAuth2(clientId, clientSecret, redirectUrl);
    
    oauth2Client.on('tokens', (tokens) => {
      var refreshToken;
      var accessToken;
      if (tokens.refresh_token) {
        // store the refresh_token in my database!
        //console.log(`refresh: ${tokens.refresh_token}`);
        refreshToken = tokens.refresh_token;
      }
      // console.log(`akses: ${tokens.access_token}`);
      accessToken = tokens.access_token

      oauth2Client.setCredentials({ 
        // refresh_token: `STORED_REFRESH_TOKEN`,
        access_token: accessToken
      });
      
    });

    
    // Check if we have previously stored a token from firebase db.
    if(storedYoutubeToken===undefined){
        database.ref("app/information/server/youtubeApi/token").once('value', async (snapshot)=>{
            if(snapshot.val()!==""){
                storedYoutubeToken = JSON.parse(snapshot.val());
                oauth2Client.credentials = storedYoutubeToken;
                callback(oauth2Client);
            }else{
                getNewToken(oauth2Client, callback);
            }
        });
    }else{
        oauth2Client.credentials = storedYoutubeToken;
        callback(oauth2Client);
    }
    
}


/**
   * Get and store new token after prompting for user authorization, and then
   * execute the given callback with the authorized OAuth2 client.
   *
   * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
   * @param {getEventsCallback} callback The callback to call with the authorized
   *     client.
   */
function getNewToken(oauth2Client, callback) {
    var authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
    console.log('Authorize this app by visiting firebase database app/information/server/youtubeApi: ', authUrl);
    _sendYoutubeTokenURL(authUrl);
    database.ref("app/information/server/youtubeApi/confirmationCode").on('value', async (snapshot)=>{
        if(snapshot.val()!==""){
            oauth2Client.getToken(snapshot.val(), function(err, token) {
                if (err) {
                  console.log('Error while trying to retrieve access token', err);
                  return;
                }
                oauth2Client.credentials = token;
                _sendYoutubeTokenCode(token);
                // storeToken(token);
                callback(oauth2Client);
              });
        }
    });


    // console.log('Authorize this app by visiting this url: ', authUrl);
    // var rl = readline.createInterface({
    //   input: process.stdin,
    //   output: process.stdout
    // });
    // rl.question('Enter the code from that page here: ', function(code) {
    //   rl.close();
    //   oauth2Client.getToken(code, function(err, token) {
    //     if (err) {
    //       console.log('Error while trying to retrieve access token', err);
    //       return;
    //     }
    //     oauth2Client.credentials = token;
    //     storeToken(token);
    //     callback(oauth2Client);
    //   });
    // });

}


//Listen for streaming task with cron
database.ref("app/information/server/streamCronStart").on('value', async (snapshot)=>{
    if(streamStartCron !== undefined){
        streamStartCron.stop();
    }
    streamStartCron = cron.schedule(snapshot.val(), async() => {
        console.log(`execute streamCronStart: ${snapshot.val()}`);
        _startStreaming().then(async()=>{
            await _streamingCCTV();
        });
    },{
        timezone: "Asia/Jakarta"
    });
});

//Listen for end streaming task with cron
database.ref("app/information/server/streamCronStop").on('value', async (snapshot)=>{
    if(streamEndCron !== undefined){
        streamEndCron.stop();
    }
    streamEndCron = cron.schedule(snapshot.val(), async() => {
        console.log(`execute streamCronStop: ${snapshot.val()}`);
        _stopStreaming();
    },{
        timezone: "Asia/Jakarta"
    });
});



//<<[API Start]===

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/api_documentation.html');
});

app.post('/hwinfo', (req, res) => {
    updateHardwareInfo(req.body.type, req.body.ipAddress).then((result)=>{
        if(result){
            res.status(200).json({
                status: {
                    code: 200,
                    message: `Success updating ${req.body.type} information.`,
                }
            });
        }else{
            res.status(404).json({
                status: {
                    code: 404,
                    message: `Update failed, hardware type not found.`,
                }
            });
        }
        
    });
});

app.get('/trigger', (req, res) => {
    triggerBell().then(()=>{
        res.status(200).json({
            status: {
                code: 200,
                message: 'Doorbell triggered successfully',
            }
        });
    });
});

app.get('/snapall', (req, res) => {
    snapAllCam().then(()=>{
        res.status(200).json({
            status: {
                code: 200,
                message: 'Snap camera successfully',
            }
        });
    });
});

app.get('/camstatus', (req, res) => {
    getCamStatus().then(()=>{
        res.status(200).json({
            status: {
                code: 200,
                message: 'get camera status succesfully',
            }
        });
    });
});

app.post('/onStream', (req, res)=>{

    console.log(`execute onStream`);
    _startStreaming().then(async()=>{
        await _streamingCCTV();
    });

    if(req.body.duration!=undefined){
        var interval = setInterval(function(){
            _stopStreaming();
            clearInterval(interval);
        }, req.body.duration);
    }

    res.status(200).json({
        status: {
            code: 200,
            message: `Stream will start soon...`,
        }
    });

});

app.get('/offStream', (req, res)=>{
    
    console.log(`execute offStream`);
    _stopStreaming();

    res.status(200).json({
        status: {
            code: 200,
            message: `Stream will be stopped soon...`,
        }
    });
});

app.get('/restartStream', (req, res)=>{
    
    console.log(`execute restartStream`);
    _restartStreaming();

    res.status(200).json({
        status: {
            code: 200,
            message: `Stream will be restart soon...`,
        }
    });
});




//===[API End]>>


app.listen(port, () => {
    console.log(`listening at http://localhost:${port}`)
});

async function _streamingCCTV(){
    try{
        console.log("streaming started...");
        // streamProcess = spawn('ffmpeg', [
        //     '-rtsp_transport', 'tcp',
        //     '-i', 'rtsp://192.168.100.60/live/ch00_1',
        //     '-rtsp_transport', 'tcp',
        //     '-i', 'rtsp://192.168.100.70/live/ch00_1',
        //     '-f', 'lavfi',
        //     '-i','anullsrc',
        //     '-filter_complex', "nullsrc=size=854x480, drawbox=x=0:w=854:h=480:t=fill:c=black, drawtext=text='%{localtime}':fontsize=20:fontcolor=white:x=(w-text_w)/2:y=15[base]; [0:v] setpts=PTS-STARTPTS, scale=427x240[upperleft]; [1:v] setpts=PTS-STARTPTS, scale=427x240[upperright]; [base][upperleft] overlay=shortest=1:x=0:y=125[tmp1]; [tmp1][upperright] overlay=shortest=1:x=427:y=125",
        //     '-preset','veryfast',
        //     '-vcodec','libx264',
        //     '-threads','6',
        //     '-b:v','4000k',
        //     '-pix_fmt','yuv420p',
        //     '-max_muxing_queue_size', '512',
        //     '-f','flv',
        //     'rtmp://a.rtmp.youtube.com/live2/49gr-d1eg-xau0-haz7-ch5v'
        //     ]);
        streamProcess = spawn('ffmpeg', [
            '-rtsp_transport', 'tcp',
            '-i', 'rtsp://192.168.100.60/live/ch00_1',
            '-rtsp_transport', 'tcp',
            '-i', 'rtsp://192.168.100.70/live/ch00_1',
            '-f', 'lavfi',
            '-i','anullsrc',
            '-filter_complex', "nullsrc=size=854x480, drawbox=x=0:w=854:h=480:t=fill:c=black, drawtext=text='%{localtime}':fontsize=20:fontcolor=white:x=(w-text_w)/2:y=15[base]; [0:v] setpts=PTS-STARTPTS, scale=427x240[upperleft]; [1:v] setpts=PTS-STARTPTS, scale=427x240[upperright]; [base][upperleft] overlay=shortest=1:x=0:y=125[tmp1]; [tmp1][upperright] overlay=shortest=1:x=427:y=125",
            '-preset','veryfast',
            '-vcodec','libx264',
            '-threads','6',
            '-b:v','4000k',
            '-pix_fmt','yuv420p',
            '-f','flv',
            'rtmp://a.rtmp.youtube.com/live2/49gr-d1eg-xau0-haz7-ch5v'
            ]);
            //uncomment for debuging ffmpeg
            streamProcess.stderr.on('data', (data) => {
                console.log(`${data}`);
                if(data == "Conversion failed!" || data == "Conversion failed!\n"){
                    _sendSystemLog("Stream detect (Conversion failed) distruption, trying to call _restartStreaming().");
                    _restartStreaming();
                }
            });
    }catch(e){
        console.log("error:", e);
    }

}

async function _getCCTVImage(){
    try{
        const cmd = "ffmpeg -rtsp_transport tcp -y -i rtsp://192.168.100.70/live/ch00_1 -s 852x480 -f image2 -vf fps=fps=3 -nostdin -loglevel panic -strftime 1 -vframes 1 cctv.jpg";
        console.log("processing ffmpeg snapshot...");
        await exec(cmd);
        console.log("done");
    }catch(e){
         console.log("error:", e);
    }
}

async function _sendMessage(){
    var filePath = `cctv%2Fsnapshot%2F${year}%2F${month}%2F${day}%2F${unixNow}`;
    var imageUrl = `https://firebasestorage.googleapis.com/v0/b/manyaran-sistem.appspot.com/o/${filePath}.jpg?alt=media`;
    const pesan = {
        topic : "Doorbell",
        notification:{
            title: "Smart Doorbell",
            body: `Seseorang mengunjungi rumah anda (${hour}:${minute}:${second})`,
            image: imageUrl
        },
        data:{
            image_url: imageUrl
        },
        android:{
          priority: "high",
          notification:{
            channel_id : 'manyaran_id',
            tag : 'tag1',
            click_action : 'FLUTTER_NOTIFICATION_CLICK',
            sound : 'notification.mp3',
          }
        }
    };
    
    messaging.send(pesan);
}

async function _sendAll(){
    try{
        const filePath = `cctv/snapshot/${year}/${month}/${day}/${unixNow}.jpg`;
        await _getCCTVImage().then(async()=>{
            console.log(`uploading image...`);
            await storage.bucket("gs://manyaran-sistem.appspot.com").upload("./cctv.jpg",
                {destination: filePath}
            );
            console.log(`uploaded`);
            await _sendMessage();
        });
    }catch(e){
        console.log("error:", e);
    }
}

async function _sendErrorLog(description){
    now.setTime(unixNow*1000);
    const path = 'log/errorLog';
    await database.ref(path).push({
        dateTime: now.toISOString(),
        ipAddress: ipClient.replace('::ffff:', ''),
        errorDescription: description,
    });
}

async function _sendSystemLog(description){
    now.setTime(unixNow*1000);
    const path = 'log/informationLog';
    await database.ref(path).push({
        dateTime: now.toISOString(),
        message: description,
    });
}

async function _sendYoutubeTokenURL(url){
    now.setTime(unixNow*1000);
    const path = 'app/information/server/youtubeApi';
    await database.ref(path).update({
        dateTime: now.toISOString(),
        authUrl: url,
        confirmationCode:""
    });
}

async function _sendYoutubeTokenCode(code){
    now.setTime(unixNow*1000);
    const path = 'app/information/server/youtubeApi';
    await database.ref(path).update({
        token:JSON.stringify(code)
    });
}

async function triggerBell() {
    await database.ref('doorbell/isOn').set(true);
    await database.ref(`visitors/${year}/${month}`).push({
        date: unixNow
    });
    await _sendAll();
}

async function updateHardwareInfo(type, ipaddress) {
    try{
        if(type == hardware.BUTTON){
            await database.ref('bellbutton').set({
                ipAddress: ipaddress,
                firstBoot: unixNow
            });
            return true;
        }else if(type == hardware.BELL){
            await database.ref('doorbell').set({
                ipAddress: ipaddress,
                firstBoot: unixNow
            });
            return true;
        }else{
            return false;
        }
    }catch(e){
        console.log("error:", e);
        return false;
    }
}

async function snapAllCam() {
    try{
        await database.ref('app/information/camera').once('value', async (snapshot)=>{
            var cams = snapshot.val();
            await cams.forEach(async(element, index) => {
                const cmd = `ffmpeg -rtsp_transport tcp -y -i ${element.ip_local} -s 852x480 -f image2 -vf fps=fps=3 -nostdin -loglevel panic -strftime 1 -vframes 1 snap-${index}.jpg`;
                console.log(`processing ffmpeg snapshot cam-${index}...`);
                await exec(cmd);
                console.log(`uploading image cam-${index}...`);
                const filePath = `cctv/last_snapshot/${index}.jpg`;
                await storage.bucket("gs://manyaran-sistem.appspot.com").upload(`./snap-${index}.jpg`,{destination: filePath});
                console.log(`uploaded`);
            });
        });
    }catch(e){
        _sendErrorLog(`snapAllCam(): ${e.code}`);
        console.log("error:", e.code);
    }
}

async function getCamStatus(){
    try{
        const path = 'app/information/camera';
        await database.ref(path).once('value', async (snapshot)=>{
            var cams = snapshot.val();
            await cams.forEach(async(element, index) => {
                try{
                    var url = new URL(element.ip_local);
                    const port = 554;
                    tcpp.probe(url.host, port, async function(err, available) {
                        if(available){
                            await database.ref(`${path}/${index}/is_online`).set(true);
                        }else{
                            await database.ref(`${path}/${index}/is_online`).set(false);
                        }
                    });
                }catch(e){
                    _sendErrorLog(`getCamStatus(): ${e.code}`);
                    console.log("getCamStatus():", e.code);
                }
                
            });
        });
    }catch(e){
        _sendErrorLog(`getCamStatus(): ${e.code}`);
        console.log("getCamStatus():", e);
    }
}

async function _startStreaming(){
    fs.readFile('youtube_key.json', function processClientSecrets(err, content) {
        if (err) {
            console.log('Error loading client secret file: ' + err);
            return; 
        }
        authorize(JSON.parse(content), createBroadcast);
    });
}

async function _stopStreaming(){
    console.log("_stopStreaming executed.");
    if(streamProcess !== undefined){
        console.log("process to end live streaming with spawn");
        streamProcess.kill();
        // kill(streamProcess.pid);
        console.log("live streaming has ended");
    }
    fs.readFile('youtube_key.json', function processClientSecrets(err, content) {
        if (err) {
            console.log('Error loading client secret file: ' + err);
            return; 
        }
        authorize(JSON.parse(content), cleanBroadcast);
    });
}

async function _restartStreaming(){
    console.log("_restartStreaming executed.");
    if(streamProcess !== undefined){
        console.log("process to restart streaming...");
        streamProcess.kill();
        console.log("please wait rerun streaming...");
        _streamingCCTV();
        console.log("stream restarted...");
    }else{
        console.log("previous stream not found...");
    }
}


/**
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
 async function createBroadcast(auth){
    var service = google.youtube('v3');
            var now = new Date();
            var generateStream = await service.liveBroadcasts.insert({
                auth: auth,
                part: ["snippet","contentDetails","status"],
                requestBody: {
                    "snippet": {
                    "title": now.toLocaleString(),
                    "scheduledStartTime": now.toISOString(),
                    },
                    "contentDetails": {
                    "enableClosedCaptions": true,
                    "enableContentEncryption": true,
                    "enableDvr": true,
                    "enableEmbed": false,
                    "recordFromStart": true,
                    "enableAutoStart": true,
                    "enableAutoStop": true,
                    },
                    "status": {
                    "privacyStatus": "public",
                    "liveBroadcastPriority": "high",
                    "selfDeclaredMadeForKids": false
                    },
                    "kind": "youtube#liveBroadcast"
                }
            });
            await service.liveBroadcasts.bind({
                auth: auth,
                part:["snippet"],
                streamId: "lyAfq_YnC9WEpcwGJoW_Vg1637838387606276",
                id: generateStream.data.id
            });
}


/**
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function cleanBroadcast(auth){
    var service = google.youtube('v3');
    var generateStream = await service.liveBroadcasts.list({
        auth: auth,
        part: ["snippet","contentDetails","status"],
        broadcastStatus: "upcoming",
        broadcastType: "all",
        maxResults: 50,
    });
    generateStream.data.items.forEach(async(element)=>{
        await service.liveBroadcasts.delete({
            auth: auth,
            id: element.id
        });
    });
    
}


/**
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listBroadcast(auth){
    var service = google.youtube('v3');

    // app.post('/xxx', async(req, res) => {
        
    //     var broadcastList = await service.liveBroadcasts.list({
    //         auth: auth,
    //         part: ["snippet","contentDetails","status"],
    //         broadcastType: "all",
    //         // pageToken: req.body.prevPageToken,
    //         maxResults: 15,
    //         mine: true,
    //     });

    //     res.status(200).json({
    //         status: {
    //             code: 200,
    //             data:{
    //                 prevPageToken: broadcastList.data.prevPageToken,
    //                 nextPageToken: broadcastList.data.nextPageToken,
    //                 videos: broadcastList.data.items,
    //             },
    //         }
    //     });

        

    // });

}
