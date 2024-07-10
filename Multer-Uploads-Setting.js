// const multer = require('multer');
// const path = require('path');


// // == Multer settings for Excel file upload ==
//     const ExcelStorage = multer.diskStorage({
//         destination: (req, file, cb) => {
//             cb(null, 'Uploads/Excel');
//         },
//         filename: (req, file, cb) => {
//             const timestamp = Date.now();
//             const originalname = file.originalname;

//             // Generate filename based on user_id and timestamp
//             const filename = `uploadExcel_${timestamp}_${originalname}`;
//             cb(null, filename);
//         }
//     });

//     const ExcelUpload = multer({
//         storage: ExcelStorage,
//         fileFilter: (req, file, cb) => {
//             if (!file) {
//                 return cb(new Error('No file uploaded'));
//             }
            
//             if (!file.originalname) {
//                 return cb(new Error('File original name is undefined'));
//             }

//             const ext = path.extname(file.originalname);
//             if (ext !== '.xlsx') {
//                 return cb(new Error('Only .xlsx files are allowed'));
//             }
            
//             cb(null, true);
//         }
//     });
// //====================================================================================

// // == Multer settings for profile image upload ==
// const profileStorage = multer.diskStorage({
//     destination: (req, file, cb) => {
//         cb(null, 'Uploads/Profile');
//     },
//     filename: (req, file, cb) => {
//         const random = crypto.randomBytes(3).toString('hex');
//         const timestamp = Date.now();
//         const originalname = file.originalname;

//         // Generate filename based on user_id and timestamp
//         const filename = `uploadProfile_${timestamp}_${random}_${originalname}`;
//         cb(null, filename);
//     }
// });
// const ProfileUpload = multer({ storage: profileStorage });

// module.exports = { ProfileUpload, ExcelUpload };