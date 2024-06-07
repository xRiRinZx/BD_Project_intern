const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config();

class Database {
    constructor() {
        
        this.connection = mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,  
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });
    }

    checkConnection(callback) {
        this.connection.connect(function(err) {
            if (err) {
                callback(false, err);
            } else {
                callback(true);
            }
        });
    }

    executeQuery(query, params, callback) {
        this.checkConnection((isConnected, err) => {
            if (!isConnected) {
                console.error('Failed to connect to the database:', err);
                return res.json({ 
                    status: 'error', 
                    message: 'Failed to connect to the database', 
                    error: err });
            } else {
                console.log('Successfully connected to the database');
            }
            this.connection.execute(query, params, callback);
        });
    }

    closeConnection() {
        this.connection.end();
    }
}

module.exports = new Database();
