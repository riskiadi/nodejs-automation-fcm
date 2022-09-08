const express = require('express');
const bodyParser = require('body-parser');
const authorizationPwd = "riskiadi+";

const app = express();
const router = express.Router();
const port = 2021;

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(function (req, res, next) {
    
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


//===[API End]>>


app.listen(port, () => {
    console.log(`listening at http://localhost:${port}`)
});
