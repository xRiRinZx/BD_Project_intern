var express = require('express');
var cors = require('cors');
var app = express();
const router = express.Router();
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json();
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const moment = require('moment-timezone');


const config = require('./config');
const database = require('./database');
const transactionsRouter = require('./Transactions');
const FavTransactions = require('./FavTransactions');
const User = require('./User');
const Categories = require('./Categories');
const Tags = require('./Tags');
const ImEx_Excelfile = require('./ImEx_Excelfile');
const AuthenAndgetUser = require('./Authen_getUser');

app.use(cors());
dotenv.config();
moment.tz.setDefault(config.timezone);


app.use('/', transactionsRouter);
app.use('/', User);
app.use('/', FavTransactions)
app.use('/', Categories)
app.use('/', Tags)
app.use('/', ImEx_Excelfile)
app.use('/exports', express.static(path.join(__dirname, 'exports')));


app.listen(3000, function () {
    console.log('CORS-enabled web server listening on port 3000');
});