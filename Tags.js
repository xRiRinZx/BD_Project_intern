const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const database = require('./database');
const config = require('./config');
const dotenv = require('dotenv');
const moment = require('moment-timezone');

const CheckandgetUser = require('./Authen_getUser');

dotenv.config();
moment.tz.setDefault(config.timezone);

// Function to execute query
function executeQuery(query, params) {
    return new Promise((resolve, reject) => {
        database.executeQuery(query, params, (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results);
            }
        });
    });
}

//== Create UserTags ==
async function createTags(req, res, next){
    const user_id = res.locals.user.user_id;
    const username = res.locals.user.firstname;
    const { tag_name } = req.body;

    if (!user_id || !tag_name ) {
        return res.json({ status: 'error', message: 'Please fill TagName completely.'})
    }
    try {
        const createTagsQuery = 'INSERT INTO Tags (tag_name, user_id) VALUES (?, ?)';
        await executeQuery(createTagsQuery,[tag_name, user_id]);
        res.json({ status: 'ok', message: `Create Tags for User: ${username} Successfully` });
    } catch (err){
        res.json({ status: 'error', message: err.message });
    }
}

//== Edit UserTags ==
async function editTags(req, res, next){
    const user_id = res.locals.user.user_id;
    const username = res.locals.user.firstname;
    const selected_tag = req.body.tag_id;
    const { tag_name } = req.body;

    if (!user_id || !selected_tag || !tag_name ) {
        return res.json({ status: 'error', message: 'Please fill out the information completely.'})
    }
    try {
        //Check if the categories exists for the given user
        const checkTagsUserQuery = 'SELECT * FROM Tags WHERE tag_id = ? AND user_id = ?';
        const tagExists = await executeQuery(checkTagsUserQuery,[selected_tag, user_id])
        if (tagExists.length === 0) {
            return res.json({ status: 'error', message: 'Tags not found for this user.' });
        }

        const updateEditTags = 'UPDATE Tags SET tag_name = ? WHERE user_id = ? AND tag_id = ?';
        await executeQuery(updateEditTags,[tag_name, user_id, selected_tag]);
        res.json({ status: 'ok', message: `Edit Tags for User: ${username} Successfully.`})
    } catch (err){
        res.json({ status: 'error', message: err.message });
    }
}

//== Delete UserTags ==
async function deleteTags(req, res, next){
    const user_id = res.locals.user.user_id;
    const username = res.locals.user.firstname;
    const selected_tag = req.body.tag_id;

    if (!user_id || !selected_tag) {
        return res.json({ status: 'error', message: 'Please select Tags.' });
    }

    try {
        //Check if the tags exists for the given user
        const checkTagUserQuery = 'SELECT * FROM Tags WHERE tag_id = ? AND user_id = ?';
        const tagExists = await executeQuery(checkTagUserQuery,[selected_tag, user_id]);
        if (tagExists.length === 0) {
            return res.json({ status: 'error', message: 'Tags not found for this user.' });
        }

        // Delete TagsUser
        const deleteTagsQuery = 'DELETE FROM Tags WHERE tag_id = ? AND user_id = ?';
        await executeQuery(deleteTagsQuery,[selected_tag, user_id]);
        
        res.json({ status: 'ok', message: `Tag deleted from User: ${username} Successfully` });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}

// == Get AllTags ==
async function getTags(req, res, next){
    const user_id = res.locals.user.user_id;
    if (!user_id) {
        return res.json({ status: 'error', message: 'User ID is Required'})
    }
    try {
        const tagQuery = 'SELECT tag_name, tag_id, user_id FROM Tags WHERE user_id = ?';
        const tag = await executeQuery(tagQuery, [user_id]);

        let summaryTags = [];
         
                tag.forEach(tag =>{
                    const tagData = {
                        tag_id: tag.tag_id,
                        tag_name: tag.tag_name,
                        user_id: tag.user_id
                    }
                    summaryTags.push(tagData);
                    
                });
        res.json({
            status:'ok',
            message:'Get Tags Successfully',
            data:{
                summaryTags,
            }
        })
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}

router.post('/createTags', jsonParser, CheckandgetUser, createTags);
router.put('/edit-tag', jsonParser, CheckandgetUser, editTags);
router.delete('/delete-tag' ,jsonParser, CheckandgetUser, deleteTags);
router.get('/getTags', jsonParser, CheckandgetUser , getTags);

module.exports = router;