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
    
        if (!categoryId) {
            agent.add('หมวดหมู่ที่เลือกไม่ถูกต้อง กรุณาเลือกใหม่');
            return;
        }
    
        const selectedCategory = categories.find(cat => cat.id === categoryId);
        if (!selectedCategory) {
            agent.add('หมวดหมู่ที่เลือกไม่ถูกต้อง กรุณาเลือกใหม่');
            return;
        }
    
        // Set context for awaiting_amount
        agent.context.set({
            name: 'awaiting_amount',
            lifespan: 5,
            parameters: { category_id: selectedCategory.id, transactionType: context.transactionType }
        });
    
        // Prepare message for user to enter transaction amount
        agent.add('กรุณาใส่จำนวนเงินของธุรกรรม');
    }
    
    async function getAmount(agent) {
        const amount = agent.parameters.amount;
        const context = agent.context.get('awaiting_amount').parameters;
    
        console.log('Amount:', amount);
    
        // Validate amount
        if (!amount || isNaN(amount)) {
            agent.add('จำนวนเงินที่ใส่ไม่ถูกต้อง กรุณาใส่เป็นตัวเลข');
            return;
        }
    
        // Validate selected category
        const categoryId = context.category_id;
        if (!categoryId) {
            agent.add('ข้อมูลไม่ถูกต้อง กรุณาเลือกหมวดหมู่ใหม่');
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
            name: "awaiting_select_tag_id",
            lifespan: 5,
            parameters: { ...context, fav }
        })
        agent.add('ต้องการเพิ่มtagไหม? (เพิ่ม / ไม่เพิ่ม)')
    }
        
    async function getTag(agent) {
        const context = agent.context.get('awaiting_select_tag_id').parameters;
        const tag = agent.parameters.tag;
        console.log(user_id)
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
                parameters: { ...context, options, tag }
            });
    
            const optionsText = options.map(option => `${option.id}: ${option.name}`).join(', ');
            agent.add(`กรุณาเลือกแท็กที่ต้องการ (ตัวอย่าง: เลข​tag_id, เลข​tag_id): ${optionsText}`);
    
            // Ensure you're not calling `record(req, res, next);` here
        } catch (err) {
            agent.add(`Error: ${err.message}`);
        }
    }

    async function getRecord(agent) {
        const select_tag = agent.parameters.select_tag;
        const context = agent.context.get('awaiting_tag_id').parameters;
        console.log(user_id)
        
        if (!select_tag) {
            agent.add('แท็กที่เลือกไม่ถูกต้อง กรุณาเลือกใหม่');
            return;
        }
    
        agent.context.set({
            name: 'awaiting_record',
            lifespan: 5,
            parameters: { ...context, tag_id: select_tag }
        });
        record(agent);
        agent.add('บันทึกสำเร็จ');
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
                const tagIdString = tag_id.join(',');
                const checkTagsQuery = `SELECT * FROM Tags WHERE tag_id IN (${tagIdString}) AND user_id = ?`;
                const tagsExist = await executeQuery(checkTagsQuery, user_id);

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

            const transaction_id = transactionInsertResult.insertId;

            // Insert into Transactions_Tags_map if tag_id is present
            if (Array.isArray(tag_id) && tag_id.length > 0) {
                const tagValues = tag_id.map(tag => [transaction_id, tag]);
                const tagValuesPlaceholder = tagValues.map(() => '(?, ?)').join(', ');
                const flattenedTagValues = tagValues.flat();

                const insertTagsQuery = `INSERT INTO Transactions_Tags_map (transaction_id, tag_id) VALUES ${tagValuesPlaceholder}`;
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
    
    // == Record Transactions ==

    let intentMap = new Map();
    intentMap.set('AskTransactionType', askTransactionType);
    intentMap.set('GetTransactionType', getTransactionType);
    intentMap.set('GetCategory', getCategory);
    intentMap.set('GetAmount', getAmount);
    intentMap.set('GetNote', getNote);
    intentMap.set('GetDetail', getDetail);
    intentMap.set('GetDatetime', getDatetime);
    intentMap.set('GetFav', getFav);
    intentMap.set('GetTag', getTag);
    intentMap.set('GetRecord', getRecord);
    intentMap.set('Record', record);
    agent.handleRequest(intentMap);
}

// == Record Transactions ==
// async function record(agent) {
//     if (!category_id || !amount || !note || !transaction_datetime || fav === undefined) {
//         agent.add('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
//         return;
//     }

//     const detailValue = detail !== undefined ? detail : null;
//     const transactionDatetimeThai = moment(transaction_datetime).format('YYYY-MM-DD HH:mm:ss');
//     const favValue = fav !== undefined && fav !== null ? fav : 0;

//     try {
//         // Check CategorieUser
//         const checkCategorieUserQuery = 'SELECT * FROM Categories WHERE categorie_id = ? AND user_id = ? OR user_id IS NULL';
//         const categorieExists = await executeQuery(checkCategorieUserQuery, [category_id, [user_id]]);

//         if (categorieExists.length === 0) {
//             agent.add('ไม่พบหมวดหมู่สำหรับผู้ใช้นี้');
//             return;
//         }

//         // Check TagAdd
//         if (Array.isArray(tag_id) && tag_id.length > 0) {
//             // Convert tag_id array to a comma-separated string for the query
//             const tagIdString = tag_id.join(',');
//             const checkTagsQuery = `SELECT * FROM Tags WHERE tag_id IN (${tagIdString}) AND user_id = ?`;
//             const tagsExists = await executeQuery(checkTagsQuery, [user_id]);

//             if (tagsExists.length !== tag_id.length) {
//                 agent.add('มีแท็กบางรายการไม่เป็นของผู้ใช้');
//                 return;
//             }
//         }

//         // Add To Transactions
//         const addTransaction = 'INSERT INTO Transactions (user_id, categorie_id, amount, note, detail, transaction_datetime, fav) VALUES (?, ?, ?, ?, ?, ?, ?)';
//         const transactionInsertResult = await executeQuery(addTransaction, [user_id, category_id, amount, note, detailValue, transactionDatetimeThai, favValue]);

//         if (!transactionInsertResult || !transactionInsertResult.insertId) {
//             throw new Error('การบันทึกธุรกรรมล้มเหลว');
//         }

//         const transaction_id = transactionInsertResult.insertId;

//         if (Array.isArray(tag_id) && tag_id.length > 0) {
//             const values = tag_id.map(tag => [transaction_id, tag]);
//             const valuesPlaceholder = values.map(() => '(?, ?)').join(', ');
//             const flattenedValues = values.flat();

//             const insertMapQuery = `INSERT INTO Transactions_Tags_map (transaction_id, tag_id) VALUES ${valuesPlaceholder}`;
//             await executeQuery(insertMapQuery, flattenedValues);
//         }

//         // ตอบกลับผู้ใช้ว่าบันทึกสำเร็จพร้อมแสดงรายละเอียดของธุรกรรมที่บันทึกได้
//         const responseMessage = `บันทึกธุรกรรมเรียบร้อยแล้ว\n\nหมวดหมู่: ${category_id}\nจำนวนเงิน: ${amount}\nโน๊ต: ${note}\nรายละเอียด: ${detailValue}\nวันที่และเวลา: ${transactionDatetimeThai}\nFavorite: ${favValue === 1 ? 'ใช่' : 'ไม่ใช่'}`;
//         agent.add(responseMessage);

//     } catch (err) {
//         // ตอบกลับในกรณีเกิด error
//         agent.add(`เกิดข้อผิดพลาดในการบันทึกธุรกรรม: ${err.message}`);
//     }
// }



router.post('/chatbot-record', jsonParser, AuthenAndgetUser, ChatbotRecord);
module.exports = router;