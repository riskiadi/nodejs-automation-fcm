const express = require('express');
var admin = require("firebase-admin");
const bodyParser = require('body-parser');
var cron = require('node-cron');
const date = require('date-and-time');
const authorizationPwd = "riskiadi+";
const app = express();
const port = 2021;

var serviceAccount = require("./firebaseadmin.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://telemonitoring-kanker-default-rtdb.asia-southeast1.firebasedatabase.app"
});
var db = admin.database();

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(function (req, res, next) {
    
    return next()

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

//===[API Start]>>

var now = new Date(new Date().toUTCString()).getTime();
let unixEpochTime = (now);
const dd=new Date(unixEpochTime);
let myFormattedDateTime = date.format(dd, 'YYYY/MM/DD HH:mm:ss');

cron.schedule('* * * * * *', () => {
    console.log(`API CALLED ${myFormattedDateTime}`);
});

// while(true){
//     let date_ob = new Date();
//     console.log("API CALLED");
// };

app.get('/time', async (req, res) => {

    var now = new Date(new Date().toUTCString()).getTime();
    let unixEpochTime = (now);
    const dd=new Date(unixEpochTime);
    let myFormattedDateTime = date.format(dd, 'YYYY/MM/DD HH:mm:ss');

    res.status(200).json({
        status: {
            code: 200,
            message: myFormattedDateTime,
        }
    });
    
});



app.get('/', (req, res) => {
    res.sendFile(__dirname + '/front.html');
});

app.get('/read', async (req, res) => {

    const message = {
        data: {
          score: '850',
          time: '2:45'
        },
        topic: "riskiadi"
      };

      try {
        await admin.messaging().send(message);
      } catch (error) {
        console.log('Error:', error);
      }
    // admin.messaging().send(message).then((response)=>{
    //     console.log('Successfully sent message:', response);
    // });

    var ref = db.ref("/schedule").orderByChild("jam");
    ref.once("value", function(snapshot) {
        res.status(200).json({
            status: {
                code: 200,
                message: snapshot.val(),
            }
        });
    });

});

//===[API End]>>


app.listen(port, () => {
    console.log(`listening at http://localhost:${port}`)
});
