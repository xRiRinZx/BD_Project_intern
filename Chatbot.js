const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const { WebhookClient } = require('dialogflow-fulfillment');
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

//=========================================[RecordTransactions Command]=========================================
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
                'SELECT categorie_id, name FROM Categories WHERE (user_id = ? OR user_id IS NULL) AND type = "expenses"';
    
            const categories = await executeQuery(categoriesQuery, [user_id]);
    
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
        const categories = context.options; // Assuming options contain category objects
    
        console.log('Selected Category:', categoryId);
    
        // Check if categoryId is valid
        const selectedCategory = categories.find(cat => cat.id == categoryId);
        if (!selectedCategory) {
            // Remove the incorrect context if category is invalid
            agent.context.set({
                name: 'awaiting_amount',
                lifespan: 0,
            });
    
            agent.add('หมวดหมู่ที่เลือกไม่ถูกต้อง กรุณาเลือกใหม่');
            return;
        }
    
        // If valid, proceed
        agent.add('กรุณาใส่จำนวนเงินของธุรกรรม');
    
        agent.context.set({
            name: 'awaiting_amount',
            lifespan: 5,
            parameters: { category_id: selectedCategory.id, transactionType: context.transactionType }
        });
    }
    
    
    
    async function getAmount(agent) {
        const amount = agent.parameters.amount;
        const context = agent.context.get('awaiting_amount').parameters;
    
        console.log('Amount:', amount);
    
        // Validate amount
        if (!amount || isNaN(amount)) {
            // Remove the incorrect context if is invalid
            agent.context.set({
                name: 'awaiting_note',
                lifespan: 0,
            });
    
            agent.add('จำนวนเงินที่ใส่ไม่ถูกต้อง กรุณาใส่เป็นตัวเลข');
            return;
        }
    
        // Proceed with the amount entered
        agent.context.set({
            name: 'awaiting_note',
            lifespan: 5,
            parameters: { ...context, amount }
        });
    
        // Prompt user to enter transaction note
        agent.add('กรุณาใส่ชื่อโน๊ตของธุรกรรม (ระบุ ชื่อ: note ที่ต้องการบันทึก)');
    }
    

    async function getNote(agent) {
        const context = agent.context.get('awaiting_note').parameters;
        const note = agent.parameters.note;
        agent.context.set({
            name: 'awaiting_detail',
            lifespan: 5,
            parameters: { ...context, note }
        })
        agent.add('กรุณาใส่รายละเอียดของธุรกรรม (ถ้ามีให้กรอก รายละเอียด: detailที่ต้องการ / ไม่มี)');
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
    
        // Validate transaction_datetime format
        const isValidDatetime = moment(transaction_datetime, ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD'], true).isValid();
    
        if (!isValidDatetime) {
            agent.context.set({
                name: 'awaiting_fav',
                lifespan: 0,
            });
            agent.add('รูปแบบวันที่ไม่ถูกต้อง กรุณากรอกใหม่');
            return;
        }
    
        // Format transaction_datetime to Thai format
        const transactionDatetimeThai = moment(transaction_datetime).format('YYYY-MM-DD HH:mm:ss');
    
        // Set context for awaiting_fav
        agent.context.set({
            name: 'awaiting_fav',
            lifespan: 5,
            parameters: { ...context, transaction_datetime: transactionDatetimeThai }
        });
    
        agent.add('ต้องการเพิ่มเป็น favorite ไหม? (เพิ่ม = 1 / ไม่เพิ่ม = 0)');
    }

    async function getFav(agent) {
        const context = agent.context.get('awaiting_fav').parameters;
        const fav = agent.parameters.fav;
    
        if (fav !== 1 || fav !== 0) {
            agent.context.set({
                name: "awaiting_select_tag_id",
                lifespan: 0,
            });
            agent.add('กรุณาใส่เฉพาะค่า 1 หรือ 0 เท่านั้น');
            return;
        } 
        agent.context.set({
            name: "awaiting_select_tag_id",
            lifespan: 5,
            parameters: { ...context, fav }
        });
        agent.add('ต้องการเพิ่ม tag ไหม? (เพิ่ม / ไม่เพิ่ม)');
    }
    
    async function handleTagDecision(agent) {
        const context = agent.context.get('awaiting_select_tag_id').parameters;
        const decision = agent.parameters.decision;
    
        if (decision === 'เพิ่ม') {
            await getTag(agent);
        } else if (decision === 'ไม่เพิ่ม') {
            await getRecordNo(agent,context);
        } else {
            agent.add('คำสั่งไม่ถูกต้อง กรุณาพิมพ์ "เพิ่ม" หรือ "ไม่เพิ่ม"');
        }
    }
    
    async function getTag(agent) {
        const context = agent.context.get('awaiting_select_tag_id').parameters;
        console.log(user_id);
    
        try {
            const tagQuery = 'SELECT * FROM Tags WHERE user_id = ?';
            const tags = await executeQuery(tagQuery, [user_id]);
    
            if (tags.length === 0) {
                agent.add('ไม่พบแท็กสำหรับผู้ใช้นี้');
                return;
            }
    
            const options = tags.map(tag => ({
                id: tag.tag_id,
                name: tag.tag_name
            }));
    
            agent.context.set({
                name: 'awaiting_tag_id',
                lifespan: 5,
                parameters: { ...context, options }
            });
    
            const optionsText = options.map(option => `${option.id}: ${option.name}`).join(', ');
            agent.add(`กรุณาเลือกแท็กที่ต้องการ (ตัวอย่าง: เลข​tag_id, เลข​tag_id): ${optionsText}`);
        } catch (err) {
            agent.add(`Error: ${err.message}`);
        }
    }
    
    async function getRecord(agent) {
        let select_tag = agent.parameters.select_tag;
        let context = agent.context.get('awaiting_tag_id').parameters ;
        const options = context.options || []; // assuming options contain the valid tags
        console.log(user_id);
        
        if (!select_tag || typeof select_tag === 'string' && select_tag.trim() === '') {
            select_tag = [];
        } else if (typeof select_tag === 'string') {
            select_tag = select_tag.split(',').map(tag => parseInt(tag.trim(), 10)).filter(tag => !isNaN(tag));
        } else if (!Array.isArray(select_tag)) {
            select_tag = [select_tag];
        }
        
        // Check if all selected tags are valid
        const invalidTags = select_tag.filter(tag => !options.some(option => option.id === tag));

        if (invalidTags.length > 0) {
            // Remove the incorrect context if it is invalid
            agent.context.set({
                name: 'awaiting_record',
                lifespan: 0,
            });
            agent.add(`แท็กที่เลือกไม่ถูกต้อง: ${invalidTags.join(', ')} กรุณาเลือกใหม่`);
            return;
        }
    
        // If all tags are valid, proceed
        agent.context.set({
            name: 'awaiting_record',
            lifespan: 5,
            parameters: { ...context, tag_id: select_tag }
        });
    
        await record(agent);
        agent.add('บันทึกสำเร็จ');
        // Clear all contexts
        const contexts = agent.contexts;
        contexts.forEach(ctx => {
            agent.context.set({
                name: ctx.name,
                lifespan: 0,
            });
        });
    }

    async function getRecordNo(agent,context) {
        let select_tag = agent.parameters.select_tag;
        const options = context.options || []; // assuming options contain the valid tags
        console.log(user_id);
        
        if (!select_tag || typeof select_tag === 'string' && select_tag.trim() === '') {
            select_tag = [];
        } else if (typeof select_tag === 'string') {
            select_tag = select_tag.split(',').map(tag => parseInt(tag.trim(), 10)).filter(tag => !isNaN(tag));
        } else if (!Array.isArray(select_tag)) {
            select_tag = [select_tag];
        }
        
        // Check if all selected tags are valid
        const invalidTags = select_tag.filter(tag => !options.some(option => option.id === tag));

        if (invalidTags.length > 0) {
            // Remove the incorrect context if it is invalid
            agent.context.set({
                name: 'awaiting_record',
                lifespan: 0,
            });
            agent.add(`แท็กที่เลือกไม่ถูกต้อง: ${invalidTags.join(', ')} กรุณาเลือกใหม่`);
            return;
        }
    
        // If all tags are valid, proceed
        agent.context.set({
            name: 'awaiting_record',
            lifespan: 5,
            parameters: { ...context, tag_id: select_tag }
        });
    
        await record(agent);
        agent.add('บันทึกสำเร็จ');
        // Clear all contexts
        const contexts = agent.contexts;
        contexts.forEach(ctx => {
            agent.context.set({
                name: ctx.name,
                lifespan: 0,
            });
        });
    }

    async function record(agent) {
        const context = agent.context.get('awaiting_record').parameters;
        // const user_id = context.user_id;
        console.log(user_id)
        const category_id = context.category;
        const amount = context.amount;
        const note = context.note;
        const detail = context.detail;
        const transaction_datetime = context.transaction_datetime;
        const fav = context.fav;
        const tag_id = context.tag_id; // Assuming tag_id is already an array

        console.log('user_id:', user_id)
        console.log('category_id:', category_id)
        console.log('amount:', amount)
        console.log('note:', note)
        console.log('detail:', detail)
        console.log('transaction_datetime:', transaction_datetime)
        console.log('fav:', fav)
        console.log('tag_id:', tag_id)

        // Check for undefined values and replace with null where necessary
        const detailValue = detail !== undefined ? detail : null;
        const transactionDatetimeThai = transaction_datetime ? moment(transaction_datetime).format('YYYY-MM-DD HH:mm:ss') : null;
        const favValue = fav !== undefined && fav !== null ? fav : 0;

        try {
            // Check CategoryUser
            const checkCategoryUserQuery = 'SELECT * FROM Categories WHERE categorie_id = ? AND (user_id = ? OR user_id IS NULL)';
            const categoryExists = await executeQuery(checkCategoryUserQuery, [category_id, user_id]);

            if (categoryExists.length === 0) {
                agent.add('ไม่พบหมวดหมู่สำหรับผู้ใช้นี้');
                return;
            }
            console.log('======1=======')

            // Check TagAdd
            if (Array.isArray(tag_id) && tag_id.length > 0) {
                const tagIdArray = tag_id; // tag_id ต้องเป็น array ที่มีค่าตัวเลขที่ต้องการค้นหา
                const checkTagsQuery = `SELECT * FROM Tags WHERE tag_id IN (${tagIdArray}) AND user_id = ?`;
                const tagsExist = await executeQuery(checkTagsQuery, [user_id]);



                if (tagsExist.length !== tag_id.length) {
                    agent.add('มีแท็กบางรายการไม่เป็นของผู้ใช้');
                    return;
                }
            }
            console.log('======2=======')

            // Add To Transactions
            const addTransactionQuery = 'INSERT INTO Transactions (user_id, categorie_id, amount, note, detail, transaction_datetime, fav) VALUES (?, ?, ?, ?, ?, ?, ?)';
            console.log('======2.1=======')
            const transactionInsertResult = await executeQuery(addTransactionQuery, [user_id, category_id, amount, note, detailValue, transactionDatetimeThai, favValue]);
            console.log('======2.2=======')
            if (!transactionInsertResult || !transactionInsertResult.insertId) {
                console.log('======2.3=======')
                throw new Error('การบันทึกธุรกรรมล้มเหลว');
            }
            console.log('======3=======')

            const transactions_id = transactionInsertResult.insertId;

            // Insert into Transactions_Tags_map if tag_id is present
            if (Array.isArray(tag_id) && tag_id.length > 0) {
                const tagValues = tag_id.map(tag => [transactions_id, tag]);
                const tagValuesPlaceholder = tagValues.map(() => '(?, ?)').join(', ');
                const flattenedTagValues = tagValues.flat();

                const insertTagsQuery = `INSERT INTO Transactions_Tags_map (transactions_id, tag_id) VALUES ${tagValuesPlaceholder}`;
                await executeQuery(insertTagsQuery, flattenedTagValues);
            }
            console.log('======4=======')

            // Success response
            const responseMessage = `บันทึกธุรกรรมเรียบร้อยแล้ว\n\nหมวดหมู่: ${category_id}\nจำนวนเงิน: ${amount}\nโน๊ต: ${note}\nรายละเอียด: ${detailValue}\nวันที่และเวลา: ${transactionDatetimeThai}\nFavorite: ${favValue === 1 ? 'ใช่' : 'ไม่ใช่'}`;
            console.log(responseMessage)
            // agent.add(responseMessage);

        } catch (err) {
            // Error response
            agent.add(`เกิดข้อผิดพลาดในการบันทึกธุรกรรม: ${err.message}`);
        }
    }
//======================================================================================================================

//=========================================[SummaryDay Command]=========================================
async function dailySummary(agent) {
    const user_id = res.locals.user.user_id;

    if (!user_id) {
        agent.add('ไม่พบข้อมูลผู้ใช้ กรุณาลองใหม่');
        return;
    }

    try {
        let dateString = agent.parameters.date || 'today';
        let date_start, date_end;

        if (dateString === 'today') {
            date_start = moment().startOf('day').format('YYYY-MM-DD HH:mm:ss');
            date_end = moment().endOf('day').format('YYYY-MM-DD HH:mm:ss');
        } else {
            // แปลง ISO 8601 format ให้เป็น 'YYYY-MM-DD'
            const momentDate = moment(dateString, moment.ISO_8601);
            date_start = momentDate.startOf('day').format('YYYY-MM-DD HH:mm:ss');
            date_end = momentDate.endOf('day').format('YYYY-MM-DD HH:mm:ss');
        }

        const incomeQuery = 'SELECT SUM(amount) as total_income FROM Transactions WHERE user_id = ? AND transaction_datetime BETWEEN ? AND ? AND categorie_id IN (SELECT categorie_id FROM Categories WHERE type = "income")';
        const expenseQuery = 'SELECT SUM(amount) as total_expense FROM Transactions WHERE user_id = ? AND transaction_datetime BETWEEN ? AND ? AND categorie_id IN (SELECT categorie_id FROM Categories WHERE type = "expenses")';

        const [incomeResult, expenseResult] = await Promise.all([
            executeQuery(incomeQuery, [user_id, date_start, date_end]),
            executeQuery(expenseQuery, [user_id, date_start, date_end])
        ]);

        const totalIncome = incomeResult[0].total_income || 0;
        const totalExpense = expenseResult[0].total_expense || 0;
        const save = totalIncome - totalExpense;

        const date_range = (date_start === date_end)
            ? moment(date_start).format('YYYY-MM-DD')
            : `${moment(date_start).format('YYYY-MM-DD')} - ${moment(date_end).format('YYYY-MM-DD')}`;

        agent.add(`สรุปรายรับรายวันสำหรับวันที่ ${date_range}:
            \nรายรับ: ${totalIncome} บาท
            \nรายจ่าย: ${totalExpense} บาท
            \nคงเหลือ: ${save} บาท
            \nมีอะไรให้ช่วยเหลืออีกไหมคะ?`);
    } catch (err) {
        agent.add(`เกิดข้อผิดพลาดในการดึงข้อมูล: ${err.message}`);
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
    intentMap.set('HandleTagDecision', handleTagDecision);
    intentMap.set('GetTag', getTag);
    intentMap.set('GetRecord', getRecord);
    intentMap.set('GetRecordNo', getRecordNo);
    intentMap.set('Record', record);
    intentMap.set('DailySummary', dailySummary);
    agent.handleRequest(intentMap);
}


router.post('/chatbot-record', jsonParser, AuthenAndgetUser, ChatbotRecord);
module.exports = router;