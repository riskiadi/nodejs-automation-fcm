const express = require('express');
var admin = require("firebase-admin");
const bodyParser = require('body-parser');
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

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/front.html');
});

app.get('/read', (req, res) => {

    var ref = db.ref("/schedule").orderByChild("jam");
    ref.once("value", function(snapshot) {
        res.status(200).json({
            status: {
                code: 200,
                message: snapshot.val(),
            }
        });
    })

});

//===[API End]>>


app.listen(port, () => {
    console.log(`listening at http://localhost:${port}`)
});
