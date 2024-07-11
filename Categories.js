const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const database = require('./database');
const config = require('./config');
const dotenv = require('dotenv');
const moment = require('moment-timezone');
const { executeQuery } = require('./database');

const CheckandgetUser = require('./Authen_getUser');

dotenv.config();
moment.tz.setDefault(config.timezone);

//== Create UserCategories ==
async function createCategories(req, res, next){
    const user_id = res.locals.user.user_id;
    const username = res.locals.user.firstname;
    const selected_type = req.body.type;
    const { name } = req.body;

    if (!user_id || !selected_type || !name ) {
        return res.json({ status: 'error', message: 'Please selectType and fill CategorieName completely.'})
    }
    try {
        const createCategoriesQuery = 'INSERT INTO Categories (name, type, user_id) VALUES (?, ?, ?)';
        await executeQuery(createCategoriesQuery,[name, selected_type, user_id]);
        res.json({ status: 'ok', message: `Create Categorie for User: ${username} Successfully` });
    } catch (err){
        res.json({ status: 'error', message: err.message });
    }
}

//== Edit UserCategories ==
async function editCategories(req, res, next){
    const user_id = res.locals.user.user_id;
    const username = res.locals.user.firstname;
    const selected_categorie = req.body.categorie_id;
    const { name , type } = req.body;

    if (!user_id || !selected_categorie || !name || !type) {
        return res.json({ status: 'error', message: 'Please fill out the information completely.'})
    }
    try {
        //Check if the categories exists for the given user
        const checkCategorieUserQuery = 'SELECT * FROM Categories WHERE categorie_id = ? AND user_id = ?';
        const categorieExists = await executeQuery(checkCategorieUserQuery,[selected_categorie, user_id])
        if (categorieExists.length === 0) {
            return res.json({ status: 'error', message: 'Categories not found for this user.' });
        }

        const updateEditCategorie = 'UPDATE Categories SET name = ?, type = ? WHERE user_id = ? AND categorie_id = ?';
        await executeQuery(updateEditCategorie,[name, type, user_id, selected_categorie]);
        res.json({ status: 'ok', message: `Edit Categorie for User: ${username} Successfully.`})
    } catch (err){
        res.json({ status: 'error', message: err.message });
    }
}

//== Delete UserCategories ==
async function deleteCategories(req, res, next) {
    const { categorie_id } = req.body;
    const user_id = res.locals.user.user_id;

    try {
        const default_income_categorie_id = 4; 
        const default_expense_categorie_id = 16; 

        // check categorie
        const checkCategorieQuery = 'SELECT * FROM Categories WHERE categorie_id = ? AND user_id = ?';
        const categorieExists = await executeQuery(checkCategorieQuery, [categorie_id, user_id]);

        if (categorieExists.length === 0) {
            return res.json({ status: 'error', message: 'Categorie not found.' });
        }
        // check type user_id is NULL ?
        if (categorieExists[0].user_id === null) {
            return res.json({ status: 'error', message: 'Cannot delete a default categorie.' });
        }

        // check delete categorie from user_id
        if (categorieExists[0].user_id !== user_id) {
            return res.json({ status: 'error', message: 'Not found categorie_id from this User' });
        }

        // check type (income or expenses)
        const categorieType = categorieExists[0].type;

        let default_categorie_id;
        if (categorieType === 'income') {
            default_categorie_id = default_income_categorie_id;
        } else if (categorieType === 'expenses') {
            default_categorie_id = default_expense_categorie_id;
        } else {
            return res.json({ status: 'error', message: 'Unknown categorie type.' });
        }

        // Update Transactions categorie >> default_categorie_id 
        const updateTransactionsQuery = 'UPDATE Transactions SET categorie_id = ? WHERE categorie_id = ?';
        await executeQuery(updateTransactionsQuery, [default_categorie_id, categorie_id]);

        // delete categorie
        const deleteCategorieQuery = 'DELETE FROM Categories WHERE categorie_id = ?';
        await executeQuery(deleteCategorieQuery, [categorie_id]);

        res.json({ status: 'ok', message: 'Categorie deleted successfully and transactions updated.' });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}


// == Get AllCategories ==
async function getCategories(req, res, next){
    const user_id = res.locals.user.user_id;
    if (!user_id) {
        return res.json({ status: 'error', message: 'User ID is Required'})
    }
    try {
        const categorieQuery = 'SELECT name, type, categorie_id, user_id FROM Categories WHERE user_id = ? OR user_id IS NULL';
        const categorie = await executeQuery(categorieQuery, [user_id]);

        let incomeCategories = [];
        let expenseCategories = [];
         
                categorie.forEach(categorie =>{
                    const categorieData = {
                        categorie_id: categorie.categorie_id,
                        name: categorie.name,
                        user_id: categorie.user_id
                    }

                    if (categorie.type === 'income') {
                        incomeCategories.push(categorieData);
                    } else if (categorie.type === 'expenses') {
                        expenseCategories.push(categorieData);
                    }
                });
        res.json({
            status:'ok',
            message:'Get Categories Successfully',
            data:{
                income: incomeCategories,
                expenses: expenseCategories,
            }
        })
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}

router.post('/createCategorie', jsonParser, CheckandgetUser, createCategories);
router.put('/edit-categorie', jsonParser, CheckandgetUser, editCategories);
router.delete('/delete-categorie' ,jsonParser, CheckandgetUser, deleteCategories);
router.get('/getcategories', jsonParser, CheckandgetUser , getCategories);

module.exports = router;