var express = require('express');
var cors = require('cors');
var app = express();
const router = express.Router();
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json();
const dotenv = require('dotenv');

const config = require('./config');
const database = require('./database');
const transactionsRouter = require('./Transactions');
const User = require('./User');
const extendToken = require('./authen');

app.use(cors());
dotenv.config();


app.use('/', transactionsRouter);
app.use('/', User);


app.listen(3000, function () {
    console.log('CORS-enabled web server listening on port 3000');
});