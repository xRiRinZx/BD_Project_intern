// const express = require('express');
// const router = express.Router();
// const bodyParser = require('body-parser');
// const jsonParser = bodyParser.json();
// const database = require('./database');
// const config = require('./config');
// const dotenv = require('dotenv');

// const CheckandExtendToken = require('./authen');
// const executeQuery = require('./Transactions');

// dotenv.config();

// // ==Add Fav Transaction==
// async function addFavorite(req, res, next){
//     const user_id = res.locals.user.user_id;
//     const transactions_id = req.body.transactions_id

//     if (!transactions_id || !user_id) {
//         return res.json({ status: 'error', message: 'Please provide transaction_id.' });
//     }

//     try {
//         const addFavoriteQuery =`
//             INSERT INTO FavoriteTransactions (transactions_id, user_id) VALUES (?, ?)
//         `;

//         await database.executeQuery(addFavoriteQuery, [transactions_id , user_id]);
//         res.json({ status: 'ok', message: 'Favorite transaction added successfully.' });
//     } catch (err) {
//         res.json({ status: 'error', message: err.message });
//     }
// }

// // ==Get Fav Transaction==
// async function getFavorite(req, res, next) {
//     const user_id = res.locals.user.user_id;

//     if (!user_id) {
//         return res.json({ status: 'error', message: 'User not found.' });
//     }

//     try {
//         const getFavoriteQuery =`
//             SELECT Transactions.*
//             FROM Transactions
//             JOIN FavoriteTransactions ON FavoriteTransactions.transactions_id = Transactions.transactions_id
//             WHERE FavoriteTransactions.user_id = ?
//         `;

//         await database.executeQuery(getFavoriteQuery, [user_id]);
//         res.json({ status: 'ok', data: results });
//         } catch (err) {
//         res.json({ status: 'error', message: err.message });
//         }
//     }




// router.post('/addFavorite', jsonParser ,CheckandExtendToken ,addFavorite);
// router.get('/getFavorite', jsonParser ,CheckandExtendToken ,getFavorite);

// module.exports = router;