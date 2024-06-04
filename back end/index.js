const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const app = express();
app.use(bodyParser.json());

// Function to capitalize the first letter of a string
const capitalizeFirstLetter = (string) => {
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
};

// Function to generate a unique student ID
const generateStudentId = async (firstName, lastName) => {
    let baseId = firstName.charAt(0).toUpperCase() + lastName.charAt(0).toUpperCase();
    let studentId = baseId;
    let count = 0;

    while (true) {
        const doc = await db.collection('students').doc(studentId).get();
        if (!doc.exists) {
            break;
        }
        count++;
        studentId = `${baseId}${count}`;
    }

    return studentId;
};

// API endpoint to add a student
app.post('/addStudent', async (req, res) => {
    let { firstName, lastName, className, gender } = req.body;

    if (!firstName || !lastName || !className || !gender) {
        return res.status(400).send('First name, last name, class, and gender are required');
    }

    // Capitalize first and last names
    firstName = capitalizeFirstLetter(firstName);
    lastName = capitalizeFirstLetter(lastName);

    try {
        const studentId = await generateStudentId(firstName, lastName);
        const docRef = db.collection('students').doc(studentId);
        await docRef.set({
            firstName,
            lastName,
            class: className,
            gender,
            studentId
        });

        res.status(200).send(`Student added successfully with ID: ${studentId}`);
    } catch (error) {
        console.error('Error adding document: ', error);
        res.status(500).send('Internal Server Error');
    }
});

// API endpoint to create checkincheckout collection for a given date
app.post('/createCheckinCheckout', async (req, res) => {
    const { date } = req.body;

    if (!date) {
        return res.status(400).send('Date is required in the format MM-DD-YYYY');
    }

    const collectionName = `checkincheckout-${date}`;

    try {
        const studentsSnapshot = await db.collection('students').get();

        if (studentsSnapshot.empty) {
            return res.status(404).send('No students found');
        }

        const batch = db.batch();

        studentsSnapshot.forEach(doc => {
            const studentData = doc.data();
            const checkinCheckoutDocRef = db.collection(collectionName).doc(studentData.studentId);

            batch.set(checkinCheckoutDocRef, {
                studentId: studentData.studentId,
                firstName: studentData.firstName,
                lastName: studentData.lastName,
                gender: studentData.gender,
                class: studentData.class,
                dropoffTime: null,
                dropoffDriverName: null,
                pickupTime: null,
                pickupDriverName: null,
                date: getTodayDate()
            });
        });

        await batch.commit();

        res.status(200).send(`Check-in/Check-out collection created for date: ${date}`);
    } catch (error) {
        console.error('Error creating checkincheckout collection: ', error);
        res.status(500).send('Internal Server Error');
    }
});

/*
Endpoint and Method:

The endpoint is /getCheckinCheckout and it uses the GET method.
Query Parameter:

The date is passed as a query parameter.
Collection Name:

The collection name is dynamically created from the date provided in the format checkincheckout-MM-DD-YYYY.
Fetching Data:

The API checks if the collection exists and retrieves all documents from it.
Response:

If the collection exists, it sends back a list of student records.
If no records are found, it sends a 404 status with an appropriate message.
Handles errors and sends a 500 status if something goes wrong.
You can use this endpoint by sending a GET request to http://localhost:3000/getCheckinCheckout?date=06-03-2024 using Postman or any other HTTP client
*/
// API endpoint to retrieve students from checkincheckout collection for a given date
app.get('/getCheckinCheckout', async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).send('Date is required in the format MM-DD-YYYY');
    }

    const collectionName = `checkincheckout-${date}`;

    try {
        const checkinCheckoutSnapshot = await db.collection(collectionName).get();

        if (checkinCheckoutSnapshot.empty) {
            return res.status(404).send(`No records found for the collection: ${collectionName}`);
        }

        const students = [];
        checkinCheckoutSnapshot.forEach(doc => {
            students.push(doc.data());
        });

        res.status(200).send(students);
    } catch (error) {
        console.error('Error retrieving checkincheckout collection: ', error);
        res.status(500).send('Internal Server Error');
    }
});


// Helper function to get today's date in MM-DD-YYYY format
const getTodayDate = () => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0'); // January is 0!
    const yyyy = today.getFullYear();
    return `${mm}-${dd}-${yyyy}`;
};

// API endpoint to update checkin/checkout information for a student
/*
{
    "studentId": "WR",
    "dropoffTime": "08:30 AM",
    "dropoffDriverName": "John Doe",
    "pickupTime": "03:00 PM",
    "pickupDriverName": "Jane Smith"
}
*/
app.post('/updateCheckinCheckout', async (req, res) => {
    const { studentId, dropoffTime, dropoffDriverName, pickupTime, pickupDriverName } = req.body;

    if (!studentId || (!dropoffTime && !dropoffDriverName && !pickupTime && !pickupDriverName)) {
        return res.status(400).send('Student ID and at least one of dropoffTime, dropoffDriverName, pickupTime, or pickupDriverName are required');
    }

    const date = getTodayDate();
    const collectionName = `checkincheckout-${date}`;

    try {
        const docRef = db.collection(collectionName).doc(studentId);

        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).send(`No record found for student ID: ${studentId} in collection: ${collectionName}`);
        }

        const updateData = {};
        if (dropoffTime) updateData.dropoffTime = dropoffTime;
        if (dropoffDriverName) updateData.dropoffDriverName = dropoffDriverName;
        if (pickupTime) updateData.pickupTime = pickupTime;
        if (pickupDriverName) updateData.pickupDriverName = pickupDriverName;

        await docRef.update(updateData);

        res.status(200).send('Check-in/Check-out information updated successfully');
    } catch (error) {
        console.error('Error updating document: ', error);
        res.status(500).send('Internal Server Error');
    }
});

// API endpoint to search for students in today's checkincheckout collection
/**
 * GET http://localhost:3000/searchCheckinCheckout?studentId=WR

GET http://localhost:3000/searchCheckinCheckout?firstName=Wahid

GET http://localhost:3000/searchCheckinCheckout?lastName=Rahimi

GET http://localhost:3000/searchCheckinCheckout?firstName=Wahid&lastName=Rahimi

 */
app.get('/searchCheckinCheckout', async (req, res) => {
    let { studentId, firstName, lastName } = req.query;

    if (!studentId && !firstName && !lastName) {
        return res.status(400).send('At least one of studentId, firstName, or lastName is required');
    }

    const date = getTodayDate();
    const collectionName = `checkincheckout-${date}`;
    if (firstName) {
        firstName = capitalizeFirstLetter(firstName)
    }
    if (lastName) {
        lastName = capitalizeFirstLetter(lastName)
    }

    console.log(lastName)
    try {
        let query = db.collection(collectionName);
        if (studentId) {
            query = query.where('studentId', '==', studentId);
        } else {
            if (firstName) {
                query = query.where('firstName', '==', firstName);
            }
            if (lastName) {
                query = query.where('lastName', '==', lastName);
            }
        }

        const querySnapshot = await query.get();

        if (querySnapshot.empty) {
            return res.status(404).send('No matching records found');
        }

        const students = [];
        querySnapshot.forEach(doc => {
            students.push(doc.data());
        });

        res.status(200).send(students);
    } catch (error) {
        console.error('Error retrieving records: ', error);
        res.status(500).send('Internal Server Error');
    }
});


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
