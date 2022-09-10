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

async function sendObatNotif(){
    var ref = db.ref("/schedule/obat");
    ref.once("value", function(snapshot) {
        snapshot.forEach((snapshot2)=>{
            const message = {
                topic: snapshot2.key,
                data : {
                    navigation: "/pengingatObat",
                    title: "Pengingat Obat",
                    body: "waktunya minum obat sesuai anjuran"
                }
            };
            try {
                admin.messaging().send(message);
            } catch (error) {
                console.log('Error:', error);
            }
        });
    });
}

async function sendDietNotif(){
    var ref = db.ref("/schedule/diet");
    ref.once("value", function(snapshot) {
        snapshot.forEach((snapshot2)=>{
            const message = {
                topic: snapshot2.key,
                data : {
                    navigation: "/pengingatDiet",
                    title: "Pengingat Diet",
                    body: "melakukan pola hidup sehat dengan diet"
                }
            };
            try {
                admin.messaging().send(message);
            } catch (error) {
                console.log('Error:', error);
            }
        });
    });
}

//===[API Start]>>

cron.schedule('0 6 * * *', async() => {
    sendDietNotif();
});

cron.schedule('40 0 * * *', async() => {
    sendObatNotif();
});

app.get('/time', async (req, res) => {
    var serverT = new Date();
    var utc = new Date().setUTCMilliseconds(0)+(25200*1000);
    var dd = new Date(utc);
    let myFormattedDateTime = date.format(dd, 'YYYY/MM/DD HH:mm:ss');

    res.status(200).json({
        status: {
            code: 200,
            message: {
                "serverTime":serverT,
                "date":myFormattedDateTime,
            },
        }
    });

});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/front.html');
});

app.get('/obat', (req, res) => {
    sendObatNotif();
    res.status(200).json({
        status: {
            code: 200,
            message: "success",
        }
    });
});

app.get('/diet', (req, res) => {
    sendDietNotif();
    res.status(200).json({
        status: {
            code: 200,
            message: "success",
        }
    });
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
