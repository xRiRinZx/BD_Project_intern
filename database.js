const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config();

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

function checkConnection(callback) {
    connection.connect(function(err) {
        if (err) {
            callback(false, err);
        } else {
            callback(true);
        }
    });
}

function executeQuery(query, params) {
    return new Promise((resolve, reject) => {
        checkConnection((isConnected, err) => {
            if (!isConnected) {
                console.error('Failed to connect to the database:', err);
                reject(err);
            } else {
                console.log('Successfully connected to the database');
                connection.execute(query, params, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            }
        });
    });
}

module.exports = {
    executeQuery,
    closeConnection: () => connection.end()
};