const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid')
const app = express();
const PORT = 5000;
const cors = require('cors');


// Middlewares
app.use(cors());
app.use(bodyParser.json());

const usersFilePath = './userData.json';
const ordersFilePath = './ordersData.json';
const tasksFilePath = './tasksData.json'





// User
app.post('/api/signup', (req, res) => {
    const newUser = req.body;

    fs.readFileSync(usersFilePath, 'utf-8', (err, data) => {
        if (err) return res.status(500).send('Error reading file');

        let users = [];
        if (data.length) {
            users = JSON.parse(data);
        }

        // Check if user already exists
        const userExists = users.some(u => u.username === newUser.username || u.email === newUser.email || u.mobileNumber === newUser.mobileNumber);
        if (userExists) return res.status(400).send('User already exists');

        newUser['userId'] = uuidv4()
        users.push(newUser);

        fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), (err) => {
            if (err) return res.status(500).send('Error writing file');
            res.status(200).send('User registered successfully');
        });
    });
});

app.post('/api/login', (req, res) => {
    const { login, password } = req.body;

    fs.readFile(usersFilePath, (err, data) => {
        if (err) return res.status(500).send('Error reading file');

        const users = JSON.parse(data);
        const user = users.find(u => (u.username === login || u.email === login || u.mobileNumber === login) && u.password === password);

        if (user) {
            res.status(200).send({ token: 'mock-token' });
        } else {
            res.status(400).send('Invalid credentials');
        }
    });
});





// Orders
app.get('/api/orders/get-orders', (req, res) => {
    fs.readFile(ordersFilePath, 'utf-8', (err, data) => {
        if (err) {
            console.log(`Some Error getting orders: `, err);
            return res.send({ msg: 'Some Error getting orders' });
        }
        if (err) return res.status(500).send('Error reading file');
        if (!data) {
            fs.writeFile(ordersFilePath, [], 'utf-8')
            return []
        } else {
            data = JSON.parse(data)
        }
        return res.send(data)
    });
});

app.post('/api/orders/add-order', (req, res) => {
    let newOrder = req.body
    fs.readFile(ordersFilePath, 'utf-8', (err, data) => {
        if (err) {
            console.log(`Some Error adding order: `, err);
            return res.send({ msg: 'Some error adding order' })
        }

        if (!newOrder.customerName || !newOrder.dishName || !newOrder.soldAtAmount || !newOrder.actualAmount) {
            return res.send({ msg: 'Please fill the mandatory details...' })
        }

        if (!data) data = []
        else data = JSON.parse(data);
        newOrder['deliveryStatus'] = "PENDING";
        newOrder['orderId'] = uuidv4();
        newOrder['orderNumber'] = Math.random().toString(36).substr(2, 9).toUpperCase();
        data.push(newOrder);

        fs.writeFile(ordersFilePath, JSON.stringify(data, null, 2), 'utf-8', (err, newData) => {
            if (err) {
                console.error('Error writing file:', err);
                return res.status(500).send('Some Error adding order...');
            }

            res.send({ data: newOrder })
        });return res.send({ msg: 'Some Error getting orders' })
    });
});

app.post('/api/orders/orderNumber/:orderNumber', (req, res) => {
    let orderNumber = req.params.orderNumber
    fs.readFile(ordersFilePath, 'utf-8', (err, data) => {
        if (err) {
            console.log(`Some Error getting order: `, err);
            return res.status(500).send('Some Error getting order...');
        }

        if (!orderNumber) {
            return res.send({ msg: 'Some error occured' })
        }

        if (!data) return res.status(500).send('Some error occured, orders not found');
        else data = JSON.parse(data);

        let selectedOrder = data?.find(o => o.orderNumber == orderNumber)
        let index = data?.indexOf(selectedOrder)
        data[index]['deliveryStatus'] = req.body?.deliveryStatus ?? "PENDING"

        fs.writeFile(ordersFilePath, JSON.stringify(data, null, 2), 'utf-8', (err) => {
            if (err) {
                console.error('Error writing file:', err);
                return res.status(500).send('Some Error adding order...');
            }
            res.send({ data })
        });
    });
});




// Tasks
app.get('/api/tasks/get-tasks', (req, res) => {
    if (!fs.existsSync(tasksFilePath)) {
        fs.writeFile(tasksFilePath, [], 'utf-8')
    }
    fs.readFile(tasksFilePath, 'utf-8', (err, data) => {
        if (err) {
            console.log(`Some Error getting tasks: `, err);
            return []
        }
        if (!data) {
            fs.writeFile(tasksFilePath, [], 'utf-8')
            return []
        } else {
            data = JSON.parse(data)
        }
        return res.send(data)
    });
});

app.post('/api/tasks/add-task', (req, res) => {
    let newTask = req.body
    if (!fs.existsSync(tasksFilePath)) {
        fs.writeFile(tasksFilePath, [], 'utf-8')
    }
    fs.readFile(tasksFilePath, 'utf-8', (err, data) => {
        if (err) {
            console.log(`Some Error adding task: `, err);
            return []
        }

        if (!newTask.taskName) {
            return res.send({ msg: 'Please fill the mandatory details...' })
        }

        if (!data) data = []
        else data = JSON.parse(data);
        newTask['id'] = uuidv4();
        data.push(newTask);

        fs.writeFile(tasksFilePath, JSON.stringify(data, null, 2), 'utf-8', (err, newData) => {
            if (err) {
                console.error('Error writing file:', err);
                return res.status(500).send({ msg: 'Some Error task' });
            }

            return res.send({ data })
        });
    });
});

app.patch('/api/tasks/update/:taskId', (req, res) => {
    let taskId = req.params.taskId ?? req.body?.id

    if (!fs.existsSync(tasksFilePath)) {
        fs.writeFile(tasksFilePath, [], 'utf-8')
    }
    fs.readFile(tasksFilePath, 'utf-8', (err, data) => {
        if (err) {
            console.log(`Some Error updating task: `, err);
            return res.status(500).send('Some Error updating task...');
        }

        if (!data) data = []
        else data = JSON.parse(data)

        let taskToUpdate = data?.find(t => t.id == taskId)
        let index = data.indexOf(taskToUpdate)

        taskToUpdate['completed'] = req.body?.completed ?? false
        data[index] = taskToUpdate

        fs.writeFile(tasksFilePath, JSON.stringify(data, null, 2), 'utf-8', (err, newData) => {
            if (err) {
                console.error('Error updating file:', err);
                return res.status(500).send({ msg: 'Some Error updating task' });
            }

            res.send({ data })
        });
    });
});



app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
