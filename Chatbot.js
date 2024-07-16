const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const { WebhookClient, Card, Suggestion } = require('dialogflow-fulfillment');
const moment = require('moment-timezone');
const dotenv = require('dotenv');
const config = require('./config');
const jsonParser = bodyParser.json();
const AuthenAndgetUser = require('./Authen_getUser');
const { executeQuery } = require('./database');

dotenv.config();
moment.tz.setDefault(config.timezone);

async function ChatbotRecord (req, res, next) {
const user_id = res.locals.user.user_id;
    const agent = new WebhookClient({ request: req, response: res });

    async function askTransactionType(agent) {
        agent.context.set({
            name: 'awaiting_transaction_type',
            lifespan: 5
        });
        agent.add('กรุณาระบุประเภทของธุรกรรม: รายรับหรือรายจ่าย?');
    }

    async function getTransactionType(agent) {
        const transactionType = agent.parameters.transaction_type;
        
        if (!user_id) {
            agent.add('ไม่พบข้อมูลผู้ใช้ กรุณาลองใหม่');
            return;
        }

        try {
            const categoriesQuery = transactionType === 'รายรับ' ?
                'SELECT categorie_id, name FROM Categories WHERE (user_id = ? OR user_id IS NULL) AND type = "income"' :
                'SELECT categorie_id, name FROM Categories WHERE (user_id = ? OR user_id IS NULL) AND type = "expense"';
    
            const categories = await executeQuery(categoriesQuery, user_id);
    
            if (categories.length === 0) {
                agent.add('ไม่พบหมวดหมู่สำหรับผู้ใช้นี้');
                return;
            }
    
            // Build a list of options with categorie_id and name
            const options = categories.map(category => ({
                id: category.categorie_id,
                name: category.name
            }));
    
            agent.context.set({
                name: 'awaiting_categories',
                lifespan: 5,
                parameters: { options, transactionType }
            });
    
            // Prepare a message to ask user to select a category
            const optionsText = options.map(option => `${option.id}: ${option.name}`).join(', ');
            agent.add(`กรุณาเลือกหมวดหมู่: ${optionsText}`);
        } catch (err) {
            agent.add(`Error: ${err.message}`);
        }
    }

    async function getCategory(agent) {
        const categoryId = agent.parameters.category;
        const context = agent.context.get('awaiting_categories').parameters;
        const categories = context.categories;
        const category = categories.find(cat => cat.name === categoryId);

        if(!category) {
            agent.add('หมวดหมู่ที่เลือกไม่ถูกต้อง กรุณาเลือกใหม่');
            return;
        }

        agent.context.set({
            name: 'awaiting_amount',
            lifespan: 5,
            parameters: { category_id: category.categorie_id, transactionType: context.transactionType }
        })
        agent.add('กรุณาใส่จำนวนเงินของธุรกรรม');
    }

    async function getAmount(agent) {
        const context = agent.context.get('awaiting_amount').parameters;
        const amount = agent.parameters.amount;
        agent.context.set({
            name: 'awaiting_note',
            lifespan: 5,
            parameters: { ...context, amount }
        })
        agent.add('กรุณาใส่ชื่อโน๊ตของธุรกรรม');
    }

    async function getNote(agent) {
        const context = agent.context.get('awaiting_note').parameters;
        const note = agent.parameters.note;
        agent.context.set({
            name: 'awaiting_detail',
            lifespan: 5,
            parameters: { ...context, note }
        })
        agent.add('กรุณาใส่รายละเอียดของธุรกรรม (ถ้ามี)');
    }

    async function getDetail(agent) {
        const context = agent.context.get('awaiting_detail').parameters;
        const detail = agent.parameters.detail || null;
        agent.context.set({
            name: 'awaiting_transaction_datetime',
            lifespan: 5,
            parameters: { ...context, detail }
        })
        agent.add('กรุณาใส่วันที่และเวลาที่ต้องการบันทึก (รูปแบบ: ปี-เดือน-วัน ชม:นาที:วินาที)')
    }

    async function getDatetime(agent) {
        const context = agent.context.get('awaiting_transaction_datetime').parameters;
        const transaction_datetime = agent.parameters.transaction_datetime;
        const transactionDatetimeThai = moment(transaction_datetime).format('YYYY-MM-DD HH:mm:ss');
        agent.context.set({
            name: 'awaiting_fav',
            lifespan: 5,
            parameters: { ...context, transaction_datetime: transactionDatetimeThai}
        })
        agent.add('ต้องการเพิ่มเป็นfavoriteไหม? (เพิ่ม = 1 / ไม่เพิ่ม = 0)')
    }

    async function getFav(agent) {
        const context = agent.context.get('awaiting_fav').parameters;
        const fav = agent.parameters.fav;
        agent.context.set({
            name: "awaiting_tag_id",
            lifespan: 5,
            parameters: { ...context, fav }
        })
        const user_id = res.locals.user.user_id;

        try {
            const tagQuery = 'SELECT * FROM Tags WHERE user_id = ?';
            const tags = await executeQuery(tagQuery, user_id);

            if(tags.length === 0) {
                agent.add('ไม่พบแท็กสำหรับผู้ใช้นี้');
                return;
            }
            const options = tags.map(tag =>({
                id: tag.tag_id,
                name: tag.tag_name
            }));

            agent.context.set({
                name: 'awaiting_tag_id',
                lifespan: 5,
                parameters: { options, tags }
            });
            const optionsText = options.map(option => `${option.id}: ${option.name}`).join(', ');
            agent.add(`กรุณาเลือกแท็กที่ต้องการ(ตัวอย่าง: เลข​tag_id,เลข​tag_id): ${optionsText}`);

            record(req, res, next);
        } catch (err) {
        agent.add(`Error: ${err.message}`);
    }
    }
    let intentMap = new Map();
    intentMap.set('AskTransactionType', askTransactionType);
    intentMap.set('GetTransactionType', getTransactionType);
    intentMap.set('GetCategory', getCategory);
    intentMap.set('GetAmount', getAmount);
    intentMap.set('GetNote', getNote);
    intentMap.set('GetDetail', getDetail);
    intentMap.set('GetDatetime', getDatetime);
    intentMap.set('GetFav', getFav);
    agent.handleRequest(intentMap);
}

// == Record Transactions ==
async function record(req, res, next) {
    const user_id = res.locals.user.user_id;
    const { category_id, amount, note, detail, transaction_datetime, fav, tag_id } = req.body;

    if (!user_id || !category_id || !amount || !note || !transaction_datetime || fav === undefined) {
        return res.json({ status: 'error', message: 'Please fill out the information completely.' });
    }

    const detailValue = detail !== undefined ? detail : null;
    const transactionDatetimeThai = moment(transaction_datetime).format('YYYY-MM-DD HH:mm:ss');
    const favValue = fav !== undefined && fav !== null ? fav : 0;
    try {
        // Check CategorieUser
        const checkCategorieUserQuery = 'SELECT * FROM Categories WHERE categorie_id = ? AND user_id = ? OR user_id IS NULL';
        const categorieExists = await executeQuery(checkCategorieUserQuery, [category_id, user_id]);
        if (categorieExists.length === 0) {
            return res.json({ status: 'error', message: 'Categories not found for this user.' });
        }

        // Check TagAdd?
        if (Array.isArray(tag_id) && tag_id.length > 0) {
            // Convert tag_id array to a comma-separated string for the query
            const tagIdString = tag_id.join(',');
            const checkTagsQuery = `SELECT * FROM Tags WHERE tag_id IN (${tagIdString}) AND user_id = ?`;
            const tagsExists = await executeQuery(checkTagsQuery, [user_id]);

            if (tagsExists.length !== tag_id.length) {
                return res.json({ status: 'error', message: 'One or more tags do not belong to the current user.' });
            }
        }

        // Add To Transactions
        const addTransaction = 'INSERT INTO Transactions (user_id, categorie_id, amount, note, detail, transaction_datetime, fav) VALUES (?, ?, ?, ?, ?, ?, ?)';
        const transactionInsertResult = await executeQuery(addTransaction, [user_id, category_id, amount, note, detailValue, transactionDatetimeThai, favValue]);

        if (!transactionInsertResult || !transactionInsertResult.insertId) {
            throw new Error('Failed to insert transaction');
        }

        const transaction_id = transactionInsertResult.insertId;

        if (Array.isArray(tag_id) && tag_id.length > 0) {
            const values = tag_id.map(tag => [transaction_id, tag]);
            const valuesPlaceholder = values.map(() => '(?, ?)').join(', ');
            const flattenedValues = values.flat();

            const insertMapQuery = `INSERT INTO Transactions_Tags_map (transaction_id, tag_id) VALUES ${valuesPlaceholder}`;
            await executeQuery(insertMapQuery, flattenedValues);
        }

        // ตอบกลับว่าบันทึกเรียบร้อย
        res.json({ status: 'success', message: 'บันทึกธุรกรรมเรียบร้อยแล้ว' });


    } catch (err) {
        // ตอบกลับในกรณีเกิด error
        agent.add(`เกิดข้อผิดพลาดในการบันทึกธุรกรรม: ${err.message}`);
    }
}



router.post('/chatbot-record', jsonParser, AuthenAndgetUser, ChatbotRecord);
module.exports = router;