require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();

// Connect Database
connectDB();

// Init Middleware
app.use(express.json({ extended: false }));
app.use(cors());

// Define Routes
app.use('/api/users', require('./routes/users'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/tasks', require('./routes/tasks'));

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Backend Page</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    margin: 0; 
                    padding: 0; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    height: 100vh; 
                    background-color: #f4f4f4; 
                }
                .container { 
                    text-align: center; 
                    background: white; 
                    padding: 20px; 
                    border-radius: 8px; 
                    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); 
                }
                h1 { 
                    color: #333; 
                    margin-bottom: 20px; 
                }
                p { 
                    margin: 10px 0; 
                }
                a { 
                    color: #007bff; 
                    text-decoration: none; 
                }
                a:hover { 
                    text-decoration: underline; 
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Thank you for visiting the backend page</h1>
                <p>Please click the link below to redirect to the dashboard login page.</p>
                <h2><p><a href="https://main--shopping-dashboard-app-frontend.netlify.app/" target="_blank">LOGIN PAGE</a></p></h2>
                <p>Contact: <a href="mailto:08.vikrambadesara@gmail.com">08.vikrambadesara@gmail.com</a></p>
            </div>
        </body>
        </html>
    `);
});



const PORT = process.env.BACKEND_PORT || 5000;

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));