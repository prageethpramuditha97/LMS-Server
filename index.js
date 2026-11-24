const express = require('express');
const bodyParser = require('body-parser');
const otpGenerator = require("otp-generator");
const googleStorage = require('@google-cloud/storage');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const app = express();
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
const admin = require('firebase-admin');
var serviceAccount = require("./firebase-admin.json");
const fs = require('fs').promises;
const cron = require("node-cron");
const crypto = require('crypto');
const multer = require('multer');
const moment = require("moment-timezone");
const cors = require("cors");
const dayjs = require("dayjs");
app.use(cors({ origin: "*", allowedHeaders: ["Content-Type", "Authorization"] }));

const puppeteer = require('puppeteer');

const punycode = require('punycode/');

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
var nodemailer = require('nodemailer');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
   //databaseURL: "https://eduspace-7df99-default-rtdb.asia-southeast1.firebasedatabase.app",
   databaseURL: "https://eduspace-new-d1762-default-rtdb.asia-southeast1.firebasedatabase.app",
});
const db = admin.database();


var ACCESS_TOKEN = "eyJzdiI6IjAwMDAwMiIsImFsZyI6IkhTNTEyIiwidiI6IjIuMCIsImtpZCI6ImZkNGY0YzZjLWM3OWItNDU4ZC04OTI4LWI5MzFlM2EwNjEwNCJ9.eyJhdWQiOiJodHRwczovL29hdXRoLnpvb20udXMiLCJ1aWQiOiI5QzdMczlNSFE5R3ZfVzJYbjY3Nll3IiwidmVyIjoxMCwiYXVpZCI6IjAzY2ZiMjU0NjQ3NmQ3Y2Y1NmI2ZGJhNmExOWZhMmJhMDgwMTEwMzRiNGE2NWU2YTk1NzFiNGUwY2RhMmYzZjMiLCJuYmYiOjE3NjEzNjI1MDQsImNvZGUiOiJOQURNaUl0ZlREU200a054b0J0OHhRMEtHaGNidGZLN1AiLCJpc3MiOiJ6bTpjaWQ6djJEZ016WEtTTmowSmlyVjJ3NmhnIiwiZ25vIjowLCJleHAiOjE3NjEzNjYxMDQsInR5cGUiOjMsImlhdCI6MTc2MTM2MjUwNCwiYWlkIjoiUDRIMUFEU0dRMWVub0g5ZUdmX1VQUSJ9.yLv5ViVxQUKhHnt_MwxgV2RSedHlcnOacq3b6qNk7ztzeABLco6BWI3B7PQzjUiRo8P2AGhq1nkftJR2BfZ2xA";

//JWT secret (store in env variable in production)
const JWT_SECRET = "codeStack_300_2025";

//Zoom APIs Start
// Replace with your Zoom OAuth App Credentials
/*const CLIENT_ID = "v2DgMzXKSNj0JirV2w6hg";
const CLIENT_SECRET = "65fJ0Mm4z1OX079HLzu2Wt0UwTcOqKn3";
const ACCOUNT_ID = "P4H1ADSGQ1enoH9eGf_UPQ"; // Needed for Server-to-Server OAuth apps

const CLIENT_ID = "2crIZUSRQLe1nU62BY1BoQ";
const CLIENT_SECRET = "m9vUqTMIsCJGMzWRbEqjiC0rETIX7gnj";
const ACCOUNT_ID = "0-OA7zpvTHaLVlpA4JTX8Q"; // Needed for Server-to-Server OAuth apps
*/

const CLIENT_ID = "SiCPlcOYSpqRqu6hCZeLuw";
const CLIENT_SECRET = "bCPPKwVLCyBN507tTgdlHZUlKXplYzwC";
const ACCOUNT_ID = "nljggsNnTaqIAgP5isRorg"; // Needed for Server-to-Server OAuth apps

// Zoom OAuth token endpoint
const ZOOM_TOKEN_URL = "https://zoom.us/oauth/token";

// Function to get Zoom Access Token
async function getZoomAccessToken() {
    try {
        const response = await axios.post(
            ZOOM_TOKEN_URL,
            null, // No body needed for this request
            {
                headers: {
                    Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`
                },
                params: {
                    grant_type: "account_credentials",
                    account_id: ACCOUNT_ID
                }
            }
        );
		ACCESS_TOKEN = response.data.access_token;
		console.log(response.data.access_token);
		//saveAllTodayMeetingIds();
		//getMeetingInfo();
    } catch (error) {
        console.error("Error:", error.response ? error.response.data : error.message);
    }
}

// Run every 30 minutes (30 * 60 * 1000 milliseconds)
setInterval(getZoomAccessToken, 30 * 60 * 1000);

// Call the function
getZoomAccessToken();

function parseCustomDateTime(dateStr) {
  // Expecting format: "DD/MM/YYYY HH:mm"
  const [datePart, timePart] = dateStr.split(' ');
  const [day, month, year] = datePart.split('/');
  const [hour, minute] = timePart.split(':');

  return new Date(year, month - 1, day, hour, minute);
}


var meetingEmails = [
	"abcfindme1@gmail.com",
]

app.post("/api/edu/get_all_meetings", async (req, res) => {
  try {
    const { date } = req.body;

    if (!date) {
      return res.status(400).send({ error: "date is required" });
    }

    // 1️⃣ Fetch meetings for the date
    const meetingSnap = await db
      .ref(`eduSpace/Meetings/${date}`)
      .once("value");

    if (!meetingSnap.exists()) {
      return res.status(200).send({ meetings: [] });
    }

    const meetings = Object.values(meetingSnap.val());

    // 2️⃣ Collect unique product IDs
    const productIds = [
      ...new Set(meetings.map(m => m.product_id).filter(Boolean))
    ];

    // 3️⃣ Fetch ALL products in parallel
    const productSnaps = await Promise.all(
      productIds.map(id =>
        db.ref(`eduSpace/Products/${id}`).once("value")
      )
    );

    // 4️⃣ Build product → TeacherID map
    const productTeacherMap = {};
    productSnaps.forEach((snap, index) => {
      if (snap.exists()) {
        productTeacherMap[productIds[index]] = snap.val().TeacherID;
      }
    });

    // 5️⃣ Collect unique Teacher IDs
    const teacherIds = [
      ...new Set(Object.values(productTeacherMap).filter(Boolean))
    ];

    // 6️⃣ Fetch ALL teachers in parallel
    const teacherSnaps = await Promise.all(
      teacherIds.map(id =>
        db.ref(`eduSpace/Teacher/${id}`).once("value")
      )
    );

    // 7️⃣ Build Teacher map
    const teacherMap = {};
    teacherSnaps.forEach((snap, index) => {
      if (snap.exists()) {
        const { firstName, lastName, mobile, profilePic } = snap.val();
        teacherMap[teacherIds[index]] = {
          teacherId: teacherIds[index],
          firstName,
          lastName,
          mobile,
          profilePic,
        };
      }
    });

    // 8️⃣ Attach teacher info to meetings
    const enrichedMeetings = meetings.map(meeting => {
      const teacherId = productTeacherMap[meeting.product_id];

      return {
        ...meeting,
        teacher: teacherId ? teacherMap[teacherId] || null : null
      };
    });

    return res.status(200).send({ meetings: enrichedMeetings });

  } catch (error) {
    console.error("Error fetching meetings:", error);
    return res.status(500).send({ error: "Internal Server Error" });
  }
});

app.post('/api/edu/update_videoLink', async (req, res) => {
	const { productID , date , meetingID , link} = req.body;

    if (!date || !productID || !meetingID , !link) {
      return res.status(400).send({ error: "date is required" });
    }
	
	await db.ref('eduSpace/Meetings/' +  date + "/" + meetingID + "/videLink").set(link);
	await db.ref('eduSpace/Products/' + productID + "/Meetings/" + date + "/" + meetingID + "/videLink").set(link);
		
	res.status(200).send({success: true});
});


async function createPayments() {
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();

  await db.ref('ServerLog/').push(`server run for payments on ${month}-${year}`);
  
  // Fetch all data in parallel
  const [studentsSnap, productsSnap, teachersSnap] = await Promise.all([
    db.ref("eduSpace/Student").once("value"),
    db.ref("eduSpace/Products").once("value"),
    db.ref("eduSpace/Teacher").once("value")
  ]);

  const students = studentsSnap.val() || {};
  const products = productsSnap.val() || {};
  const teachers = teachersSnap.val() || {};

  const allWrites = [];

  for (const [studentId, studentData] of Object.entries(students)) {
    const enrolledProducts = studentData.Products || [];
    if (!Array.isArray(enrolledProducts) || enrolledProducts.length === 0) continue;

    for (const productId of enrolledProducts) {
      const product = products[productId];
      if (!product) {
        console.warn(`⚠️ Product not found: ${productId}`);
        continue;
      }

      const teacherId = product.TeacherID || "";
      const teacher = teachers[teacherId] || {};
      const teacherName = `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim();

      const paymentData = {
        productId,
        CreateDate: new Date().toLocaleDateString("en-CA"), // YYYY-MM-DD
        ProductName: product.name || "",
        TeacherName: teacherName,
        TeacherID: teacherId,
        Amount: product.price || "",
        Status: "Pending",
        PaymentProof: "",
        PaymentMethod: "",
        ApprovedAt: "",
        PaidAt: "",
        StudentID: studentId
      };

      const paymentPath = `eduSpace/Student/${studentId}/Payments/${year}-${month}/${productId}`;
      const paymentRef = db.ref(paymentPath);

      // Check if payment already exists
      const existsSnap = await paymentRef.once("value");
      if (!existsSnap.exists()) {
        allWrites.push(paymentRef.set(paymentData));
        //console.log(`✅ Payment created for ${studentData.firstName} (${product.name})`);
      } else {
        //console.log(`⏭️ Payment already exists for ${studentData.firstName} (${product.name})`);
      }
    }
  }

  await Promise.all(allWrites);
}

async function createPaymentsForStudent(studentId) {
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();

  // Fetch all required data in parallel
  const [studentSnap, productsSnap, teachersSnap] = await Promise.all([
    db.ref(`eduSpace/Student/${studentId}`).once("value"),
    db.ref("eduSpace/Products").once("value"),
    db.ref("eduSpace/Teacher").once("value")
  ]);

  const studentData = studentSnap.val();
  if (!studentData) {
    console.warn(`❌ No student found with ID: ${studentId}`);
    return;
  }

  const products = productsSnap.val() || {};
  const teachers = teachersSnap.val() || {};
  const enrolledProducts = studentData.Products || [];

  if (!Array.isArray(enrolledProducts) || enrolledProducts.length === 0) {
    console.warn(`⚠️ Student ${studentId} not enrolled in any products`);
    return;
  }

  const allWrites = [];

  for (const productId of enrolledProducts) {
    const product = products[productId];
    if (!product) {
      console.warn(`⚠️ Product not found: ${productId}`);
      continue;
    }

    const teacherId = product.TeacherID || "";
    const teacher = teachers[teacherId] || {};
    const teacherName = `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim();

    const paymentData = {
      productId,
      CreateDate: new Date().toLocaleDateString("en-CA"), // YYYY-MM-DD
      ProductName: product.name || "",
      TeacherName: teacherName,
      TeacherID: teacherId,
      Amount: product.price || "",
      Status: "Pending",
      PaymentProof: "",
      PaymentMethod: "",
      ApprovedAt: "",
      PaidAt: "",
      StudentID: studentId
    };

    const paymentPath = `eduSpace/Student/${studentId}/Payments/${year}-${month}/${productId}`;
    const paymentRef = db.ref(paymentPath);

    // Check if payment already exists
    const existsSnap = await paymentRef.once("value");
    if (!existsSnap.exists()) {
      allWrites.push(paymentRef.set(paymentData));
      console.log(`✅ Payment created for ${studentData.firstName} (${product.name})`);
    } else {
      console.log(`⏭️ Payment already exists for ${studentData.firstName} (${product.name})`);
    }
  }

  await Promise.all(allWrites);
  console.log(`🎉 Payments processed for student: ${studentId}`);
}


// Endpoint: /api/eduSpace/Student/payments/summary
app.post("/api/eduSpace/Student/payments/summary", async (req, res) => {
  try {
    const { studentID, months } = req.body;

    if (!studentID || !months) {
      return res.status(400).json({ error: "studentID and months are required" });
    }

    const results = [];

    for (const m of months) {
      const ref = db.ref(`eduSpace/Student/${studentID}/Payments/${m.monthYear}`);
      const snapshot = await ref.once("value");

      let paidCount = 0;
      let pendingCount = 0;
      let totalAmount = 0;

      if (snapshot.exists()) {
        snapshot.forEach((childSnap) => {
          const payment = childSnap.val();
          if (payment.Status === "Approved") {
            paidCount++;
            totalAmount += parseFloat(payment.Amount || 0);
          } else {
            pendingCount++;
            totalAmount += parseFloat(payment.Amount || 0);
          }
        });
      }

      results.push({
        id: m.id,
        date: m.date, // frontend already sending Date
        paidCount,
        pendingCount,
        totalAmount,
        monthYear: m.monthYear,
      });
    }

    return res.json(results);
  } catch (error) {
    console.error("Error fetching payment summary:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});


// Schedule a task to run at 00:12 PM daily
/*cron.schedule("16 03 * * *", () => {
  createPayments();
});*/

// Run at 00:00 local time (server-time equivalent: 03:04) on the 1st of each month
cron.schedule("4 3 1 * *", () => {
  createPayments();
});


app.post("/api/eduSpace/teachers/students", async (req, res) => {
  try {
    const { teacherId, month } = req.body;
	console.log(req.body);
    if (!teacherId) {
      return res.status(400).json({ error: "teacherId is required" });
    }

    const currentMonth =
      month || new Date().toISOString().slice(0, 7); // "YYYY-MM"

    // 1️⃣ Get teacher info
    const teacherSnap = await db.ref(`eduSpace/Teacher/${teacherId}`).once("value");
    if (!teacherSnap.exists()) {
      return res.status(404).json({ error: "Teacher not found" });
    }

    const teacher = teacherSnap.val();
    const teacherProducts = teacher.Products || [];

    // 2️⃣ Get all students
    const studentsSnap = await db.ref("eduSpace/Student").once("value");
    if (!studentsSnap.exists()) {
      return res.json([]);
    }

    const promises = [];

    studentsSnap.forEach((studentSnap) => {
      const student = studentSnap.val();

      // Check if student has any of the teacher's products
      const matchedProducts = (student.Products || []).filter((pid) =>
        teacherProducts.includes(pid)
      );

      matchedProducts.forEach((pid) => {
        const paymentRef = db.ref(
          `eduSpace/Student/${student.id}/Payments/${currentMonth}/${pid}`
        );
        const studentMeetingsRef = db.ref(
          `eduSpace/Student/${student.id}/Meetings/${pid}`
        );
        const teacherMeetingsRef = db.ref(
          `eduSpace/Teacher/${teacherId}/Meetings/${pid}`
        );
        const productRef = db.ref(`eduSpace/Products/${pid}`);

        promises.push(
          Promise.all([
            paymentRef.once("value"),
            studentMeetingsRef.once("value"),
            teacherMeetingsRef.once("value"),
            productRef.once("value"),
          ]).then(([paymentSnap, studentMeetingSnap, teacherMeetingSnap, productSnap]) => {
            const payment = paymentSnap.val() || {};
            const studentMeetings = studentMeetingSnap.val() || {};
            const teacherMeetings = teacherMeetingSnap.val() || {};
            const product = productSnap.val() || {};

            return {
              studentID: student.id,
              studentName: `${student.firstName || ""} ${student.lastName || ""}`.trim(),
              mobile: student.mobile || "",
              email: student.email || "",
              profilePic: student.profilePic || "",
              productId: pid,
              productName: product.name || "",
              paymentStatus: payment.Status || "Not Paid",
              paymentMethod: payment.PaymentMethod || "",
              paidAt: payment.PaidAt || "",
              teacherMeetings: Object.values(teacherMeetings),
              studentAttendedMeetings: Object.values(studentMeetings),
            };
          })
        );
      });
    });

    const result = await Promise.all(promises);
    return res.json(result);
  } catch (err) {
    console.error("Error fetching payment summary:", err);
    res.status(500).json({ error: err.message });
  }
});


// Endpoint: /payments/:rootId/:monthYear
app.post("/api/eduSpace/Student/payments", async (req, res) => {
  try {
    const { studentID, monthRef } = req.body;

    // Path in your database
    const ref = db.ref(`eduSpace/Student/${studentID}/Payments/${monthRef}`);
	

    const snapshot = await ref.once("value");

    if (!snapshot.exists()) {
		res.status(200).send({ success: false , error: "No payments found" });
    }
	else {
		var result = [];

		for(var i in snapshot.val())
			result.push(snapshot.val()[i]);
		res.status(200).send({ success: true , data: result});
	}
  } catch (error) {
    console.error(error);
	res.status(200).send({ success: false , error: "Internal server error" });
  }
});

app.post("/api/eduSpace/Student/upload/paySlip", async (req, res) => {
  try {
    const { studentID, monthRef , productID , slipLink, uploadedAt, studentName} = req.body;
	
	if (!studentID || !studentName || !productID || !slipLink || !uploadedAt || !monthRef) {
	  return res.status(400).json({
		error: "studentID, studentName, productID, slipLink, uploadedAt, and monthRef are required",
	  });
	}
	
	const stdData = await db.ref(`eduSpace/Student/` + studentID).once("value");
	const usrData = await db.ref(`eduSpace/User/` + studentID).once("value");
	
	if (!stdData.exists() || !usrData.exists()) {
		return res.status(400).json({ error: 'Student is Invalid' });
	}
	
    // Path in your database
    await db.ref(`eduSpace/Student/${studentID}/Payments/${monthRef}/${productID}/PaymentProof`).set(slipLink);
	await db.ref(`eduSpace/Student/${studentID}/Payments/${monthRef}/${productID}/PaymentMethod`).set("Bank");
	await db.ref(`eduSpace/Student/${studentID}/Payments/${monthRef}/${productID}/Status`).set("Waiting For Approval");
	await db.ref(`eduSpace/Student/${studentID}/Payments/${monthRef}/${productID}/PaidAt`).set(uploadedAt);
	
	const studentPaymentSnap = await db.ref(`eduSpace/Student/${studentID}/Payments/${monthRef}/${productID}`).once("value");
	const newRef = db.ref(`eduSpace/Admin/Payments/${(studentPaymentSnap.val().PaidAt).split("T")[0]}`).push(studentPaymentSnap.val());
	await newRef.child("monthRef").set(monthRef);
	await newRef.child("StudentName").set(studentName);

    res.status(200).send({ success: true , msg: "Success" });
  } catch (error) {
    console.error(error);
	res.status(200).send({ success: false , error: "Internal server error" });
  }
});

function getMonthlyPaymentInfo(input) {
  const [year, month] = input.split('-').map(Number);

  // Get the last date of the given month
  const lastDay = new Date(year, month, 0);

  // Format date as "dd Month yyyy"
  const day = String(lastDay.getDate()).padStart(2, '0');
  const monthName = lastDay.toLocaleString('default', { month: 'long' });
  const formattedDate = `${day} ${monthName} ${year}`;

  // Create payment label
  const paymentLabel = `Monthly Payment - ${monthName}`;

  return { formattedDate, paymentLabel };
}

app.post("/api/eduSpace/Admin/Payment/Approve", async (req, res) => {
  try {
    const { studentID, monthRef , productID , approvedAt , PaidAt, recordID, TeacherID, Amount , realPaidAmount} = req.body;

    // Path in your database
    await db.ref(`eduSpace/Student/${studentID}/Payments/${monthRef}/${productID}/ApprovedAt`).set(approvedAt);
	await db.ref(`eduSpace/Student/${studentID}/Payments/${monthRef}/${productID}/Status`).set("Approved");
	
	await db.ref(`eduSpace/Admin/Payments/${PaidAt.split("T")[0]}/${recordID}/ApprovedAt`).set(approvedAt);
	await db.ref(`eduSpace/Admin/Payments/${PaidAt.split("T")[0]}/${recordID}/Status`).set("Approved");
	
	const TeacherPaymentRef = await db.ref(`eduSpace/TeachersPayments/${TeacherID}/${monthRef}`).once("value");
	const StudentRef = await db.ref(`eduSpace/Student/${studentID}/`).once("value");
	const fullName = StudentRef.val().firstName + " " + StudentRef.val().lastName;
	
	if (TeacherPaymentRef.exists()) {
		const valueObj = TeacherPaymentRef.val();
		
		await db.ref(`eduSpace/TeachersPayments/${TeacherID}/${monthRef}`).set({
			"Total" : Number(valueObj.Total) + Number(realPaidAmount),
			"eduSpaceCommision" : Number(valueObj.eduSpaceCommision) + 150,
			"TotalPayable" : Number(valueObj.TotalPayable) + (Number(realPaidAmount) - 150),
			"Referenace" : getMonthlyPaymentInfo(monthRef).paymentLabel,
			"date" : getMonthlyPaymentInfo(monthRef).formattedDate,
			"Status" : "Pending",
		});
		//await db.ref(`eduSpace/TeachersPayments/${TeacherID}/${monthRef}/log`).push(`${fullName} has made the payment of LKR ${realPaidAmount}.00 at ${PaidAt.split("T")[0]} ${(PaidAt.split("T")[1]).split(".")[0]}`);
		await db.ref(`eduSpace/TeachersPaymentsLog/${TeacherID}/${monthRef}`).push({
			"studentID" : studentID,
			"monthRef" : monthRef,
			"productID" : productID,
			"realPaidAmount" : realPaidAmount,
			"PaidAt" : PaidAt,
		});
    }
	else {
		const newRefTeacherPayment = await db.ref(`eduSpace/TeachersPayments/${TeacherID}/${monthRef}`).set({
			"Total" : realPaidAmount,
			"eduSpaceCommision" : 150,
			"TotalPayable" : Number(realPaidAmount) - 150,
			"Referenace" : getMonthlyPaymentInfo(monthRef).paymentLabel,
			"date" : getMonthlyPaymentInfo(monthRef).formattedDate,
			"Status" : "Pending",
		});
		//await db.ref(`eduSpace/TeachersPayments/${TeacherID}/${monthRef}/log`).push(`${fullName} has made the payment of LKR ${realPaidAmount}.00 at ${PaidAt.split("T")[0]} ${(PaidAt.split("T")[1]).split(".")[0]}`);
		await db.ref(`eduSpace/TeachersPaymentsLog/${TeacherID}/${monthRef}`).push({
			"studentID" : studentID,
			"monthRef" : monthRef,
			"productID" : productID,
			"realPaidAmount" : realPaidAmount,
			"PaidAt" : PaidAt,
		});
	}
	
    res.status(200).send({ success: true , msg: "Success" });
  } catch (error) {
    console.error(error);
	res.status(200).send({ success: false , error: "Internal server error" });
  }
});

app.post("/api/teacherPayments/", async (req, res) => {
  const { teacherId, year } = req.body;

  try {
    const paymentsRef = db.ref(`eduSpace/TeachersPayments/${teacherId}`);
	console.log(`eduSpace/TeachersPayments/${teacherId}/${year}`);
    const snapshot = await paymentsRef.get();

    if (!snapshot.exists()) {
      return res.status(200).json({ message: "No payments found" });
    }

    const paymentsData = snapshot.val();

    // Filter only the months that belong to the given year (like 2025-01, 2025-02...)
    const filteredPayments = Object.entries(paymentsData)
      .filter(([key]) => key.startsWith(year + "-"))
      // Sort descending (latest month first)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([monthKey, data]) => ({
        monthKey,
        ...data,
      }));

    if (filteredPayments.length === 0) {
      return res.status(200).json({ message: `No payments found for ${year}` });
    }

    res.json({ year, payments: filteredPayments });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/get_teacher_courses/:teacherID", async (req, res) => {
  try {
    const { teacherID } = req.params;

    // Reference the Products node
    const productsRef = db.ref("eduSpace/Products");
    const snapshot = await productsRef.once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ message: "No products found" });
    }

    const allProducts = snapshot.val();
    const teacherProducts = [];

    // Loop through all products
    for (const productID in allProducts) {
      const product = allProducts[productID];
      if (product.TeacherID === teacherID && product.Students) {
        teacherProducts.push({
          id: product.id || productID,
          name: product.name ,
		  studentCount: product.Students.length || 0 ,
        });
      }
    }

    return res.json(teacherProducts);
  } catch (error) {
    console.error("Error fetching teacher products:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


app.get("/api/admin/payments/:dateRef", async (req, res) => {
	const { dateRef } = req.params;
  try {
    const paymentsRef = db.ref("eduSpace/Admin/Payments/" + dateRef);
    const snapshot = await paymentsRef.get();

    if (!snapshot.exists()) {
      return res.status(404).json({ message: "No payments found" });
    }

    const paymentsData = snapshot.val();
    const formatted = Object.entries(paymentsData).map(([id, data]) => ({
      id,
      ...data,
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ message: "Error fetching payments", error: error.message });
  }
});


app.get("/api/admin/students/", async (req, res) => {
  try {
    const StudentRef = db.ref("eduSpace/Student/");
    const snapshot = await StudentRef.get();

    if (!snapshot.exists()) {
      return res.status(404).json({ message: "No payments found" });
    }

    const StudentData = snapshot.val();
    const formatted = Object.entries(StudentData).map(([id, data]) => ({
      id,
      ...data,
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ message: "Error fetching payments", error: error.message });
  }
});

/*app.post("/api/get_students_for_given_course", async (req, res) => {
  const { teacherID, course } = req.body;
	console.log(teacherID + "/" + course);
  if (!teacherID || !course) {
    return res.status(400).json({ message: "Missing teacherID or course" });
  }

  try {
    // 1️⃣ Get the StudentList under the given teacher
    const teacherRef = db.ref(`eduSpace/Teacher/${teacherID}/Students`);
    const snapshot = await teacherRef.get();

    if (!snapshot.exists()) {
      return res.status(404).json({ message: "No students found for this teacher" });
    }

    const studentList = snapshot.val(); // e.g. { s001: true, s002: true }
    const studentIDs = snapshot.val();
	

    const registeredStudents = [];

    // 2️⃣ Go through each student and check their products
    for (const studentID of studentIDs) {
      const studentRef = db.ref(`eduSpace/Student/${studentID}`);
      const studentSnap = await studentRef.get();

      if (!studentSnap.exists()) continue;

      const studentData = studentSnap.val();
	  
	  
      const products = studentData.Products;
	  //console.log(products)

      // 3️⃣ Check if the given course ID is in the student's ProductList
	  const hasCourse = products.includes(course);

      // 4️⃣ If yes, push student details to list
      if (hasCourse) {
        registeredStudents.push({
          studentID,
          name: studentData.firstName + " " + studentData.lastName || "",
          email: studentData.email || "",
		  address: studentData.address || "",
		  mobile: studentData.mobile || "",
		  course: studentData.course || "",
		  status: studentData.status || "",
		  profileImage: studentData.profilePic || "",
		  attendance: studentData.attendance || "",
          products: products,
        });
      }
    }

    // 5️⃣ Return the list of students who have the given course
    return res.status(200).json({
      count: registeredStudents.length,
      students: registeredStudents,
    });
  } catch (error) {
    console.error("Error fetching students for course:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
*/

app.post("/api/get_students_for_given_course", async (req, res) => {
  const { ProductID, course, pageIndex = 0 } = req.body;
  const limit = 6; // ✅ each page shows 6 students

  if (!ProductID || !course) {
    return res.status(400).json({ message: "Missing teacherID or course" });
  }

  try {
    // 1️⃣ Get full student list for the teacher
    const teacherRef = db.ref(`eduSpace/Products/${ProductID}/Students`);
    const snapshot = await teacherRef.get();

    if (!snapshot.exists()) {
      return res.status(404).json({ message: "No students found for this teacher" });
    }

    const studentIDs = snapshot.val();

    // 2️⃣ Calculate slice range based on page index
    const startIndex = pageIndex * limit;
    const endIndex = startIndex + limit;

    // 3️⃣ Get the 6 student IDs for this page
    const paginatedStudentIDs = studentIDs.slice(startIndex, endIndex);

    if (paginatedStudentIDs.length === 0) {
      return res.status(200).json({
        count: 0,
        students: [],
        hasMore: false,
      });
    }

    // 4️⃣ Fetch students concurrently
    const studentPromises = paginatedStudentIDs.map(async (studentID) => {
      const studentSnap = await db.ref(`eduSpace/Student/${studentID}`).get();
      if (!studentSnap.exists()) return null;

      const studentData = studentSnap.val();
      const products = studentData.Products || [];
/*
      // 5️⃣ Check if the given course is in the student's Products list
      const hasCourse = Array.isArray(products) ? products.includes(course) : false;
      if (!hasCourse) return null;*/

      const meetingsSnap = await db.ref(`eduSpace/Attendance/${course}/Meetings`).once("value");
      const meetings = meetingsSnap.val();

      const stdMeetingsSnap = await db.ref(`eduSpace/Attendance/${course}/Students/${studentID}`).once("value");
      const stdMeetings = stdMeetingsSnap.val();

      const attendance = ((Number((stdMeetings || []).length) / Number((meetings || []).length || 1))) * 100;

      return {
        studentID,
        name: `${studentData.firstName || ""} ${studentData.lastName || ""}`.trim(),
        email: studentData.email || "",
        address: studentData.address || "",
        mobile: studentData.mobile || "",
        course: studentData.course || "",
        status: studentData.status || "",
        profileImage: studentData.profilePic || "",
        attendance: attendance,
        products,
      };
    });

    const allStudents = await Promise.all(studentPromises);
    const registeredStudents = allStudents.filter(Boolean);

    // 6️⃣ Check if there are more students left
    const hasMore = endIndex < studentIDs.length;

    // 7️⃣ Return paginated results
    return res.status(200).json({
      count: registeredStudents.length,
      students: registeredStudents,
      hasMore,
    });
  } catch (error) {
    console.error("Error fetching students for course:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

async function updateAttendanceNodeForMeetings(productID , meetingID , date, topic) {
  try {
    const ref = db.ref(`eduSpace/Attendance/${productID}/Meetings`);

    // Step 1: Get current data
    const snapshot = await ref.once('value');
    let currentMeetings = snapshot.val();

    // Step 2: Make sure it's an array
    if (!Array.isArray(currentMeetings)) {
      currentMeetings = [];
    }

    // Step 3: Add the new item
    currentMeetings.push(meetingID);

    // Step 4: Write back to database
    await ref.set(currentMeetings);
	await db.ref(`eduSpace/Attendance/${productID}/MeetingListData/${meetingID}`).set({"date" : date , "topic" : topic, "Run" : 0});
  } catch (error) {
    console.error("Error updating meetings:", error);
  }
}

// Function to get Zoom Access Token
app.post('/api/zoom/create/registration_required_meeting', async (req, res) => {
  try {
    const HOST_EMAIL = "eduspace.cs@gmail.com";
    const meetingRes = await axios.post(
      `https://api.zoom.us/v2/users/${HOST_EMAIL}/meetings`,
      {
        topic: req.body.title,
        type: 2,
        start_time: moment.tz(req.body.start_time, "Asia/Colombo").utc().format(), //"2025-09-08T16:30:00Z",
        duration: req.body.duration,
        timezone: "Asia/Colombo",
        settings: {
          join_before_host: false,
          waiting_room: false,
          registration_type: 2,
          approval_type: 1,
          audio: "both",
          host_video: true,
          participant_video: false,
          mute_upon_entry: true,
		  //meeting_authentication = true
        }
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
	
	var response_object = {
	  uuid: meetingRes.data.uuid,
	  meetingID: meetingRes.data.id,
	  topic: meetingRes.data.topic,
	  start_time: moment.tz(req.body.start_time, "Asia/Colombo").format("HH:mm"),
	  duration: meetingRes.data.duration,
	  start_url: meetingRes.data.start_url,
	  registration_url: meetingRes.data.registration_url,
	  product_name: req.body.product_name,
	  date: req.body.date,
	  attachments: req.body.attachments,
	  is_payment_required: req.body.is_payment_required,
	  videLink: req.body.videLink,
	};
	
	await db.ref('eduSpace/Products/' + req.body.product_id + "/Meetings/" + req.body.date + "/" + meetingRes.data.id).set(response_object);
	await updateAttendanceNodeForMeetings(req.body.product_id , response_object.meetingID , req.body.date, response_object.topic);
	await db.ref("eduSpace/Meetings/" + req.body.date + "/" + meetingRes.data.id).set(response_object);
	await db.ref("eduSpace/Meetings/" + req.body.date + "/" + meetingRes.data.id + "/product_id").set(req.body.product_id);
	
	res.send(response_object);

  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
  }
});

app.post('/api/edu/get_meeting_list', async (req, res) => {
  try {
    const { userID, monthRef, date, productList } = req.body;

    if (!date || !productList || !Array.isArray(productList)) {
      return res.status(400).send({ error: "date and productList[] required" });
    }

    const meetingPromises = productList.map(async (product) => {
      const productKey = product.productID;

      // 1️⃣ Fetch meetings for this product
      const meetingSnapshot = await db.ref(`eduSpace/Products/${productKey}/Meetings/${date}`).once("value");
      if (!meetingSnapshot.exists()) return [];

      const meetings = Object.values(meetingSnapshot.val());
	  
      // 2️⃣ Fetch payment status for this product and student
      const paymentSnapshot = await db.ref(`eduSpace/Student/${userID}/Payments/${monthRef}/${productKey}`).once("value");
      const paymentData = paymentSnapshot.exists() ? paymentSnapshot.val() : {};
      const paymentStatus = paymentData.Status || "Pending"; // default to Pending if not set

      // 3️⃣ Merge paymentStatus into each meeting
      return meetings.map((meeting) => ({
        ...meeting,
		product_id : productKey,
        PaymentStatus: paymentStatus,
        productID: productKey,
      }));
    });

    const meetingsNested = await Promise.all(meetingPromises);
    const meetings = meetingsNested.flat();

    return res.status(200).send({ meetings });
  } catch (error) {
    console.error("Error fetching meetings:", error);
    return res.status(500).send({ error: "Internal Server Error" });
  }
});


app.post('/api/edu/student/get_meeting_list', async (req, res) => {
  try {
    const { date , productList } = req.body;

    if (!date || !productList || !Array.isArray(productList)) {
      return res.status(400).send({ error: "date and productList[] required" });
    }

    const meetingPromises = productList.map(async (product) => {
      const productKey = product.productID;
	  console.log(`eduSpace/Products/${productKey}/Meetings/${date}`);
      const snapshot = await db.ref(`eduSpace/Products/${productKey}/Meetings/${date}`).once("value");
      if (!snapshot.exists()) return [];

      const meetingsObj = snapshot.val(); // { meetingID: {..data..}, ... }

      return Object.entries(meetingsObj).map(([meetingID, data]) => {
        const start_time = data.start_time;
        const duration = data.duration || 0; // assume minutes
        const end_time = start_time + duration * 60 * 1000; // adjust if needed

        return {
          meetingID,
          product_name: product.productName,   // from productList
          topic: data.topic || "",             // added topic
          registration_url: data.registration_url,
          start_time,
          end_time
        };
      });
    });

    const meetingsNested = await Promise.all(meetingPromises);
    const meetings = meetingsNested.flat();

    return res.status(200).send({ meetings });
  } catch (error) {
    console.error("Error fetching meetings:", error);
    return res.status(500).send({ error: "Internal Server Error" });
  }
});

async function updateAttendanceNodeForMeetingsOfStudent(productID , meetingID , studentID) {
  try {
    const ref = db.ref(`eduSpace/Attendance/${productID}/Students/${studentID}`);

    // Step 1: Get current data
    const snapshot = await ref.once('value');
    let currentMeetings = snapshot.val();

    // Step 2: Make sure it's an array
    if (!Array.isArray(currentMeetings)) {
      currentMeetings = [];
    }

    // Step 3: Add the new item
    currentMeetings.push(meetingID);

    // Step 4: Write back to database
    await ref.set(currentMeetings);
  } catch (error) {
    console.error("Error updating meetings:", error);
  }
}


async function registerForMeeting(MEETING_ID , registrant) {
  try {
    const response = await axios.post(
      `https://api.zoom.us/v2/meetings/${MEETING_ID}/registrants`,
      registrant,
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
	
	console.log(response.data);
  } catch (error) {
    if (error.response) {
      console.error('Error response from Zoom:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

app.post('/api/edu/student/join_meeting', async (req, res) => {
  const { studentID, meetingID, email, firstName, lastName, productID } = req.body;

  if (!studentID || !meetingID || !email || !firstName || !lastName || !productID) {
    return res.status(400).json({ error: 'studentID, meetingID, email, firstName, lastName are required' });
  }
	const stdData = await db.ref(`eduSpace/Student/` + studentID).once("value");
	const usrData = await db.ref(`eduSpace/User/` + studentID).once("value");
	
	if (!stdData.exists() || !usrData.exists()) {
		return res.status(400).json({ error: 'Student is Invalid' });
	}
  try {
    const studentMeetingRef = db.ref(`eduSpace/Student/${studentID}/Meetings/${meetingID}`);
    const snapshot = await studentMeetingRef.once('value');
    const data = snapshot.val();

    if (data) {
      // If join_url exists, return it
      return res.status(200).json({ success: true, join_url: data });
    }

    // If not, register for meeting
    const registrant = {
      email: email.replace(/@.*$/, '@codestack.lk'),
      first_name: firstName,
      last_name: lastName
    };

	console.log("test");
	await registerForMeeting(meetingID, registrant);
	await updateAttendanceNodeForMeetingsOfStudent(productID , meetingID , studentID);
    const joinUrl = await approveRequetsByPassingData(meetingID, registrant.email);
	

    // Save join_url to Firebase
    await studentMeetingRef.set(joinUrl);

    res.status(200).json({ success: true, join_url: joinUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error });
  }
});

async function approveRequetsByPassingData(meetingId, email) {
  try {
    // 1️⃣ Approve the registrant
    await axios.put(
      `https://api.zoom.us/v2/meetings/${meetingId}/registrants/status`,
      {
        action: "approve",
        registrants: [{ email }]
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    // 2️⃣ Fetch approved registrants to get join_url
    const response = await axios.get(
      `https://api.zoom.us/v2/meetings/${meetingId}/registrants?status=approved`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        }
      }
    );

    // Find the registrant by email
    const registrant = response.data.registrants.find(r => r.email === email);

    if (!registrant) {
      throw new Error("Registrant approved but join_url not found");
    }

    return registrant.join_url;

  } catch (error) {
    if (error.response) {
      console.error("❌ Zoom API Error:", error.response.data);
      throw new Error(error.response.data.message || "Zoom API Error");
    } else {
      console.error("❌ Request Failed:", error.message);
      throw new Error(error.message);
    }
  }
}

/* Schedule a task to run at 11:30 PM daily
cron.schedule("15 18 * * *", () => {
  saveAllTodayMeetingIds();
});

// Schedule a task to run at 02:30 AM daily
cron.schedule("18 18 * * *", () => {
  getMeetingInfo(); 
});
*/

function convertToSriLankanTime(utcString) {
  const utcDate = new Date(utcString);

  // Convert to Sri Lankan time by using the Asia/Colombo time zone
  const options = {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };

  // Get date parts
  const formatter = new Intl.DateTimeFormat('en-CA', options); // en-CA gives YYYY-MM-DD format
  const parts = formatter.formatToParts(utcDate);

  // Extract parts manually to build custom format
  const dateParts = {};
  parts.forEach(({ type, value }) => {
    dateParts[type] = value;
  });

  return `${dateParts.year}-${dateParts.month}-${dateParts.day} ${dateParts.hour}:${dateParts.minute}:${dateParts.second}`;
}


// --- Register Endpoint ---
app.post("/api/edu/register", async (req, res) => {
  try {
    const { email, password, ...rest } = req.body;

    if (!email || !password) {
      return res.status(400).send("Email & password required");
    }

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);
	
	const snapshot = await db.ref("eduSpace/User")
      .orderByChild("email")
      .equalTo(email)
      .once("value");

    if (snapshot.exists()) {
      return res.status(401).send("User Already Exist");
    }
	
    // push new user
    const newUserRef = await db.ref("eduSpace/User").push(req.body);
    const id = newUserRef.key;

    await newUserRef.set({
		...req.body,
		id,
		password: hashedPassword,
    });

    res.status(201).send({
	  success: true,
	  id
	});
	
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

// --- Login Endpoint ---
app.post("/api/edu/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).send("Email & password required");
    }

    const snapshot = await db.ref("eduSpace/User")
      .orderByChild("email")
      .equalTo(email)
      .once("value");

    if (!snapshot.exists()) {
      return res.status(401).send("Invalid credentials");
    }

    let user = null;
    snapshot.forEach(child => {
      const data = child.val();
      user = { id: child.key, ...data };
    });

    // check password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).send("Invalid credentials");
    }
	
	 // ✅ Process Orders → Fetch Product Details
    let updated_orders = [];
    if (user.orders && Array.isArray(user.orders)) {
      for (const orderKey of user.orders) {
        const productSnap = await db.ref(`eduSpace/Products/${orderKey}`).once("value");
        if (productSnap.exists()) {
          const product = productSnap.val();
          updated_orders.push({
            productID: orderKey,
            productName: product.name,
            productPrice: product.price,
          });
        }
      }
    }

    // replace user.orders with updated product info
    user.orders = updated_orders;
	
	// min and max in seconds
	const min = 3 * 24 * 60 * 60; // 3 days
	const max = 6 * 24 * 60 * 60; // 6 days

	// generate random expiration in seconds
	const randomExpire = Math.floor(Math.random() * (max - min)) + min;
	
    // create token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: randomExpire }
    );
	
    res.status(200).send({
	  success: true,
	  token,
	  user,
	  randomExpire
	});
  } catch (err) {
    console.error(err);
    res.status(500).send(err);
  }
});

/*
// --- Register Endpoint ---
app.post("/api/edu/create_student", async (req, res) => {
  try {
    if (!req.body.user || !req.body.id) {
      return res.status(400).send("Invalid Request");
    }

  
    // push new user
    const studentRef = await db.ref("eduSpace/Student/" + req.body.id).set(req.body.user);
	await db.ref("eduSpace/Student/" + req.body.id + "/id").set(req.body.id);
	
	// Get the current count of students
    const snapshot = await db.ref("eduSpace/Student/").once("value");
    const count = snapshot.numChildren();

    // Generate next student number (e.g., ES100 + (count + 1))
    const newStudentNo = "ES100" + (count + 1);
	
	await db.ref("eduSpace/Student/" + req.body.id + "/StudentNumber").set(newStudentNo);
	await db.ref("eduSpace/User/" + req.body.id + "/StudentNumber").set(newStudentNo);
    
    res.status(201).send({
	  success: true
	});
	
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});


/* MUST USE
app.post("/api/edu/create_student", async (req, res) => {
  try {
    const { user, id } = req.body;
    if (!user || !id) {
      return res.status(400).send("Invalid Request");
    }

    // Save user first
    await db.ref(`eduSpace/Student/${id}`).set({ ...user, id });

    // Use a transaction to safely increment the counter
    const counterRef = db.ref("eduSpace/StudentCounter");

    const result = await counterRef.transaction((currentValue) => {
      return (currentValue || 0) + 1;
    });

    if (!result.committed) {
      throw new Error("Transaction failed. Try again.");
    }

    const newStudentNo = "ES100" + result.snapshot.val();

    // Save student number to both places
    await db.ref(`eduSpace/Student/${id}/StudentNumber`).set(newStudentNo);
    await db.ref(`eduSpace/User/${id}/StudentNumber`).set(newStudentNo);

    res.status(201).send({
      success: true,
      StudentNumber: newStudentNo,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});


*/
app.post("/api/edu/create_student", async (req, res) => {
  try {
    const { user, id } = req.body;
    if (!user || !id) {
      return res.status(400).send("Invalid Request");
    }

    // Create or update the Student node
    await db.ref(`eduSpace/Student/${id}`).set({ ...user, id });

    // Reference to the global student counter
    const counterRef = db.ref("StudentCounter");

    // Safely increment counter using transaction
    const result = await counterRef.transaction((currentValue) => {
      // If node doesn't exist yet, start from 0
      if (currentValue === null || currentValue === undefined) {
        return 1; // first student will get ES1001
      }
      return currentValue + 1;
    });

    if (!result.committed) {
      throw new Error("Transaction failed, please retry.");
    }

    const newCount = result.snapshot.val();
    const newStudentNo = "ES100" + newCount;

    // Store student number in both Student and User nodes
    const updates = {};
    updates[`eduSpace/Student/${id}/StudentNumber`] = newStudentNo;
    updates[`eduSpace/User/${id}/StudentNumber`] = newStudentNo;
    await db.ref().update(updates);

    // Response
    res.status(201).send({
      success: true,
      StudentNumber: newStudentNo,
    });

  } catch (err) {
    console.error("Error creating student:", err);
    res.status(500).send("Internal server error");
  }
});


// --- JWT Middleware ---
function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(403).send("No token");

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).send("Invalid token");
    req.user = decoded;
    next();
  });
}

// --- Protected Route Example ---
app.get("/api/edu/profile", verifyToken, async (req, res) => {
  const snapshot = await db.ref(`eduSpace/User/${req.user.id}`).once("value");
  if (!snapshot.exists()) {
    return res.status(404).send("User not found");
  }
  res.status(200).send(snapshot.val());
});


// validate access token
app.get("/api/edu/validate", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(200).json({ valid: false });

  try {
    jwt.verify(token, JWT_SECRET);
    res.json({ valid: true });
  } catch (err) {
    res.status(200).json({ valid: false });
  }
});



// refresh access token
app.post("/api/edu/refresh", (req, res) => {
  const oldToken = req.headers.authorization?.split(" ")[1];
  if (!oldToken) return res.status(401).json({ success: false, message: "No token provided" });

  const { exp } = req.body;
  console.log(exp);
  try {
    const decoded = jwt.verify(oldToken, JWT_SECRET);

    // create new token
    const newToken = jwt.sign(
      { id: decoded.id, email: decoded.email },
      JWT_SECRET,
      { expiresIn: exp } // short-lived token
    );

    res.status(200).json({
      success: true,
      token: newToken,
    });

  } catch (err) {
    res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
});

app.post("/api/edu/admin/teacher", async (req, res) => {
    try {
		// push new user
		await db.ref("eduSpace/Teacher/" + req.body.id).set(req.body);
		const id = req.body.id;


		if (Array.isArray(req.body.products)) {
			await Promise.all(
				req.body.products.map(order => 
					db.ref("eduSpace/Products/" + order + "/TeacherID").set(id)
				)
			);
		}
		
		res.status(201).send({
		  success: true,
		  id
		});

	} catch (err) {
		res.status(401).json({ success: false, message: "Falied To Save Teacher" });
	}
});


app.get("/api/edu/admin/teacher", async (req, res) => {
  const snapshot = await db.ref("eduSpace/Teacher").once("value");
  if (!snapshot.exists()) {
    return res.status(404).send("User not found");
  }
  
  let teachers = [];

  snapshot.forEach(childSnapshot => {
    teachers.push({
      id: childSnapshot.key,   // Firebase auto ID
      ...childSnapshot.val()   // Teacher object inside
    });
  });
  
  

  res.status(200).json({
      success: true,
      response: teachers,
    });

});

app.get("/api/edu/student/get_teachers", async (req, res) => {
  try {
    const teacherSnap = await db.ref("eduSpace/Teacher").once("value");
    if (!teacherSnap.exists()) {
      return res.status(404).send("User not found");
    }

    const teachersData = teacherSnap.val();
    const teachers = await Promise.all(
      Object.entries(teachersData).map(async ([teacherId, data]) => {
        let products = [];

        if (Array.isArray(data.products)) {
          // build an array of promises
          const productPromises = data.products.map(async (productId) => {
            const productSnap = await db
              .ref("eduSpace/Products/" + productId)
              .once("value");
            if (productSnap.exists()) {
              const productData = productSnap.val();
              return {
                productID: productId,
                productName: productData.name,
                productPrice: productData.price,
				TeacherID: productData.TeacherID,
              };
            }
            return null;
          });

          // resolve all at once
          const resolvedProducts = await Promise.all(productPromises);
          products = resolvedProducts.filter(Boolean); // remove nulls
        }

        return {
          id: teacherId,
          firstName: data.firstName,
          lastName: data.lastName,
          mobile: data.mobile,
          profilePic: data.profilePic,
          eduLevel: data.eduLevel,
		  coverPage: data.coverPage,
          products: products,
        };
      })
    );

    res.status(200).json({
      success: true,
      response: teachers,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});



// 📘 GET products by teacher
app.post('/api/eduSpace/teacher/products', async (req, res) => {
  const { teacherId } = req.body;
	console.log(teacherId);
  if (!teacherId) {
    return res.status(400).json({ error: 'teacherId is required' });
  }

  try {
    // 1️⃣ Fetch all products
    const productsSnapshot = await db.ref('eduSpace/Products').get();

    if (!productsSnapshot.exists()) {
      return res.json([]);
    }

    const productsData = productsSnapshot.val();
    const result = [];

    // 2️⃣ Filter by TeacherID and format data
    Object.keys(productsData).forEach((key) => {
      const product = productsData[key];
      if (product.TeacherID === teacherId) {
        const studentCount = product.Students
          ? Object.keys(product.Students).length
          : 0;

        result.push({
          id: product.id || key,
          name: product.name || '',
          price: product.price || '',
          createdDate: product.createdDate || '',
		  code: product.code || '',
          studentCount,
        });
      }
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching teacher products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});


app.post("/api/edu/student/enroll_course", async (req, res) => {
  try {
    const { TeacherID, StudentID, id: ProductID } = req.body;
	const stdData = await db.ref(`eduSpace/Student/` + StudentID).once("value");
	const usrData = await db.ref(`eduSpace/User/` + StudentID).once("value");
	
	if (!stdData.exists() || !usrData.exists()) {
		return res.status(400).json({ error: 'Student is Invalid' });
	}
  
    // 1. Add StudentID under Teacher's Students if not already exists
    const TeacherRef = db.ref(`eduSpace/Teacher/${TeacherID}/Students`);
    const snapshot = await TeacherRef.once("value");
    const existingTeacherStudents = snapshot.val() || {};
    const isStudentInTeacher = Object.values(existingTeacherStudents).includes(StudentID);

    if (!isStudentInTeacher) {
      const nextIndex = Object.keys(existingTeacherStudents).length;
      await TeacherRef.child(nextIndex).set(StudentID);
	  
	  const now = new Date();
	  const currentMonth = now.toISOString().slice(0, 7); // gives 'YYYY-MM'
	  const StudentEnrollmentsRef = db.ref(`eduSpace/StudentEnrollments/${TeacherID}/${currentMonth}/`);
	  
	  const IndexForEnrollment = Object.keys(StudentEnrollmentsRef).length;
      await StudentEnrollmentsRef.child(IndexForEnrollment).set(StudentID);
    }

    // 2. Add ProductID under Student's Products if not already exists
    const studentsRef = db.ref(`eduSpace/Student/${StudentID}/Products`);
    const snapshot2 = await studentsRef.once("value");
    const existingStudentProducts = snapshot2.val() || {};
    const isProductInStudent = Object.values(existingStudentProducts).includes(ProductID);

    if (!isProductInStudent) {
      const nextIndex2 = Object.keys(existingStudentProducts).length;
      await studentsRef.child(nextIndex2).set(ProductID);
    }

    // 3. Add ProductID under User orders if not already exists
    const studentsRefLogin = db.ref(`eduSpace/User/${StudentID}/orders`);
    const snapshot3 = await studentsRefLogin.once("value");
    const existingOrders = snapshot3.val() || {};
    const isProductInOrders = Object.values(existingOrders).includes(ProductID);

    if (!isProductInOrders) {
      const nextIndex3 = Object.keys(existingOrders).length;
      await studentsRefLogin.child(nextIndex3).set(ProductID);
    }

    // 4. Add StudentID under Product's Students if not already exists
    const ProductRef = db.ref(`eduSpace/Products/${ProductID}/Students`);
    const snapshot4 = await ProductRef.once("value");
    const existingProductStudents = snapshot4.val() || {};
    const isStudentInProduct = Object.values(existingProductStudents).includes(StudentID);

    if (!isStudentInProduct) {
      const nextIndex4 = Object.keys(existingProductStudents).length;
      await ProductRef.child(nextIndex4).set(StudentID);
    }

    // Create payment entry (assumed function)
    await createPaymentsForStudent(StudentID);
	
	db.ref(`eduSpace/StudentEnrollmentsLog/${StudentID}/${ProductID}`).set(new Date().toISOString().split('T')[0]);
	
    res.status(201).send({
      success: true,
      ProductID: ProductID
    });

  } catch (err) {
    console.error("Enrollment Error:", err);
    res.status(401).json({ success: false, message: "Failed To Enroll Student" });
  }
});



app.post("/api/edu/admin/teacher/products", async (req, res) => {
  
    try {
		// push new user
		const newUserRef = await db.ref("eduSpace/Products").push(req.body);
		const id = newUserRef.key;

		await newUserRef.set({
			...req.body,
			id,
		});

		res.status(201).send({
		  success: true,
		  id
		});

	} catch (err) {
		res.status(401).json({ success: false, message: "Falied To Save Teacher" });
	}
});



app.post("/api/edu/check/email", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(200).json({ isValidEmail: false });
    }

    
	const snapshot = await db.ref("eduSpace/User")
      .orderByChild("email")
      .equalTo(email)
      .once("value");

    if (snapshot.exists()) {
      return res.status(200).json({ isValidEmail: false });
    }
	else {
		res.status(200).json({ isValidEmail: true });
	}
	
	
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

// Endpoint: /getStudentAttendance
app.post("/api/edu/student/getStudentAttendance", async (req, res) => {
  const { studentID, studentEmail , productID } = req.body;
  const snapshot = await db.ref(`eduSpace/Attendance/${productID}/Meetings/`).once("value");
  const meetingIds = snapshot.val();

  if (!studentID || !studentEmail || !productID || !snapshot.exists()) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: studentID, studentEmail, or productID",
    });
  }

  const results = [];

  for (const meetingId of meetingIds) {
    let meetingResult = {
      meetingId,
      topic: null,
      start_time: null,
      date: null,
      meeting_duration: null,
      found: false,
      student_duration: null,
      join_time: null,
      leave_time: null,
      message: "",
    };

    try {
      // Step 1: Fetch meeting report (to get topic, start time, total duration)
      try {
        const meetingInfo = await axios.get(
          `https://api.zoom.us/v2/report/meetings/${meetingId}`,
          {
            headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
          }
        );

        const info = meetingInfo.data;
        meetingResult.topic = info.topic || "Unknown Topic";
        meetingResult.start_time = info.start_time || null;
        meetingResult.date = info.start_time
          ? info.start_time.split("T")[0]
          : null;
        meetingResult.meeting_duration = info.duration || null;
      } catch (topicErr) {
        console.warn(
          `Couldn't fetch meeting info for ${meetingId}:`,
          topicErr.message
        );
        meetingResult.topic = "Unknown Topic";
        meetingResult.message = "Could not fetch meeting info.";
      }

      // Step 2: Fetch participants (with pagination)
      let allParticipants = [];
      let nextPageToken = "";

      do {
        const response = await axios.get(
          `https://api.zoom.us/v2/report/meetings/${meetingId}/participants`,
          {
            headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
            params: { page_size: 30, next_page_token: nextPageToken },
          }
        );

        const { participants = [], next_page_token = "" } = response.data;
        allParticipants.push(...participants);
        nextPageToken = next_page_token;
      } while (nextPageToken);

      // Step 3: Process attendance
      if (allParticipants.length === 0) {
        meetingResult.message = "No participants found in this meeting.";
      } else {
        const student = allParticipants.find(
          (p) =>
            p.user_email &&
            p.user_email.trim().toLowerCase() ===
              studentEmail.trim().toLowerCase()
        );

        if (student) {
          meetingResult.found = true;
          meetingResult.student_duration = student.duration || 0;
          meetingResult.join_time = student.join_time || null;
          meetingResult.leave_time = student.leave_time || null;
          meetingResult.message = "Student found in this meeting.";
        } else {
          meetingResult.message = "Student not found in this meeting.";
        }
      }
    } catch (err) {
      console.error(
        `Error fetching report for meeting ${meetingId}:`,
        err.message
      );
      meetingResult.found = false;
      meetingResult.message = `Zoom API error: ${err.message}`;
    }

    results.push(meetingResult);
  }

  return res.status(200).json({
    success: true,
    total_meetings: meetingIds.length,
    data: results,
  });
});




app.get('/product-report', async (req, res) => {
  try {

    const PRODUCT_IDS = [
      "-ObgX63wTiGXGK36G0-4",
      "-OblfeJPW-IxF-DHMFVC",
      "-Oc0_Tz1WvRUpk4NRWTg"
    ];

    const productCounts = {
      "-ObgX63wTiGXGK36G0-4": 0,
      "-OblfeJPW-IxF-DHMFVC": 0,
      "-Oc0_Tz1WvRUpk4NRWTg": 0
    };

    const studentProductMap = {};
    const userOrdersGrouped = {};
    const mismatchedStudents = {};

    const [studentSnap, userSnap] = await Promise.all([
      db.ref("eduSpace/Student").once("value"),
      db.ref("eduSpace/User").once("value")
    ]);

    const studentsData = studentSnap.val() || {};
    const usersData = userSnap.val() || {};

    for (const studentID of Object.keys(studentsData)) {
      const studentProductsRaw = studentsData[studentID].Products || {};
      const userOrdersRaw = usersData[studentID]?.orders || {};

      const studentProducts = Object.keys(studentProductsRaw)
        .filter(pid => PRODUCT_IDS.includes(pid));
      const userOrders = Object.keys(userOrdersRaw)
        .filter(pid => PRODUCT_IDS.includes(pid));
console.log(studentProductsRaw);
      const allProductIds = new Set([...studentProductsRaw, ...userOrdersRaw]);

      studentProductMap[studentID] = Array.from(allProductIds);
      userOrdersGrouped[studentID] = userOrdersRaw;

      for (const pid of allProductIds) {
        productCounts[pid]++;
      }

      // Check for mismatch
      const spSet = new Set(studentProductsRaw);
      const upSet = new Set(userOrdersRaw);
      const mismatch =
        studentProductsRaw.length !== userOrdersRaw.length ||
        studentProductsRaw.some(pid => !upSet.has(pid)) ||
        userOrdersRaw.some(pid => !spSet.has(pid));

      if (mismatch) {
        mismatchedStudents[studentID] = {
          studentProductsRaw,
          userOrdersRaw
        };
      }
    }

    res.status(200).json({
      productCounts,
      studentProductMap,
      userOrdersGrouped,
      mismatchedStudents
    });
  } catch (error) {
    console.error("Error generating report:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get('/product-report_giveDataToEachProduct', async (req, res) => {
  try {
    const db = admin.database();

    const PRODUCT_IDS = [
      "-ObgX63wTiGXGK36G0-4",
      "-OblfeJPW-IxF-DHMFVC",
      "-Oc0_Tz1WvRUpk4NRWTg"
    ];

    const productCounts = {
      "-ObgX63wTiGXGK36G0-4": 0,
      "-OblfeJPW-IxF-DHMFVC": 0,
      "-Oc0_Tz1WvRUpk4NRWTg": 0
    };

    const productStudentMap = {
      "-ObgX63wTiGXGK36G0-4": [],
      "-OblfeJPW-IxF-DHMFVC": [],
      "-Oc0_Tz1WvRUpk4NRWTg": []
    };

    const studentProductMap = {};
    const userOrdersGrouped = {};
    const mismatchedStudents = {};

    const [studentSnap, userSnap] = await Promise.all([
      db.ref("eduSpace/Student").once("value"),
      db.ref("eduSpace/User").once("value")
    ]);

    const studentsData = studentSnap.val() || {};
    const usersData = userSnap.val() || {};

    for (const studentID of Object.keys(studentsData)) {
      const studentProductsRaw = studentsData[studentID].Products || {};
      const userOrdersRaw = usersData[studentID]?.orders || {};

      const studentProducts = Object.keys(studentProductsRaw)
        .filter(pid => PRODUCT_IDS.includes(pid));
      const userOrders = Object.keys(userOrdersRaw)
        .filter(pid => PRODUCT_IDS.includes(pid));

      const allProductIds = new Set([...studentProductsRaw, ...userOrdersRaw]);

      studentProductMap[studentID] = Array.from(allProductIds);
      userOrdersGrouped[studentID] = userOrdersRaw;

      for (const pid of allProductIds) {
        productCounts[pid]++;
        if (!productStudentMap[pid].includes(studentID)) {
          productStudentMap[pid].push(studentID);
        }
      }

      const spSet = new Set(studentProductsRaw);
      const upSet = new Set(userOrdersRaw);
      const mismatch =
        studentProductsRaw.length !== userOrdersRaw.length ||
        studentProductsRaw.some(pid => !upSet.has(pid)) ||
        userOrdersRaw.some(pid => !spSet.has(pid));

      if (mismatch) {
        mismatchedStudents[studentID] = {
          studentProductsRaw,
          userOrdersRaw
        };
      }
    }

    res.status(200).json({
      productCounts,
      productStudentMap,
      studentProductMap,
      userOrdersGrouped,
      mismatchedStudents
    });
  } catch (error) {
    console.error("Error generating report:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

async function getLast6MonthsEnrollments(teacherID, currentMonth) {
  const months = [];

  for (let i = 5; i >= 0; i--) {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - i, 1);
    const monthName = date.toLocaleString("default", { month: "long" });
    const monthValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    const snapshot = await db.ref(`eduSpace/StudentEnrollments/${teacherID}/${monthValue}`).once("value");
    const data = snapshot.val();
    const count = data ? Object.keys(data).length : 0;

    months.push({ name: monthName, value: count });
  }


  return months;
}

async function getLast6MonthsRevenue(teacherID, currentMonth) {
  const months = [];

  for (let i = 5; i >= 0; i--) {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - i, 1);
    const monthName = date.toLocaleString("default", { month: "long" });
    const monthValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    const snapshot = await db.ref(`eduSpace/TeachersPayments/${teacherID}/${monthValue}`).once("value");
    const data = snapshot.val();
    const count = data ? data.Total : 0;

    months.push({ name: monthName, value: count });
  }


  return months;
}

async function getProductDetails(productIDs) {
  const results = [];
	console.log(productIDs);
  for (const id of productIDs) {
    const snapshot = await db.ref(`eduSpace/Products/${id}`).once("value");
    const data = snapshot.val();

    if (data) {
      const students = data.Students ? Object.keys(data.Students).length : 0;
      results.push({
        name: data.name,
        studentCount: students,
      });
    }
  }

  return results;
}

app.post("/api/teacherSummery/Main_features", async (req, res) => {
  try {
    const { teacherId, currentMonth } = req.body;

    // ✅ Use passed month OR fallback to current month
    const month =
      currentMonth && currentMonth.trim() !== ""
        ? currentMonth
        : new Date().toISOString().slice(0, 7); // YYYY-MM

    // 🔹 Get payment summary
    const paymentsSummerySnapshot = await db
      .ref(`eduSpace/TeachersPayments/${teacherId}/${month}`)
      .once("value");

    const paymentsSummery = paymentsSummerySnapshot.val();

    // 🔹 Get students & courses count safely
    const studentsSnap = await db
      .ref(`eduSpace/Teacher/${teacherId}/Students`)
      .once("value");

    const productsSnap = await db
      .ref(`eduSpace/Teacher/${teacherId}/products`)
      .once("value");

    const studentCount = studentsSnap.val()
      ? Object.keys(studentsSnap.val()).length
      : 0;

    const courseCount = productsSnap.val()
      ? Object.keys(productsSnap.val()).length
      : 0;

    let obj;

    if (paymentsSummery) {
      const total = Number(paymentsSummery.Total || 0);
      const eduSpaceCommision = Number(paymentsSummery.eduSpaceCommision || 0);

      obj = {
        StudentCount: studentCount,
        CourseCount: courseCount,
        Total: total,
        eduSpaceCommision,
        payableAmount: total - eduSpaceCommision,
      };
    } else {
      obj = {
        StudentCount: studentCount,
        CourseCount: courseCount,
        Total: 0,
        eduSpaceCommision: 0,
        payableAmount: 0,
      };
    }

    res.status(200).json({ summery: obj });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ message: "Server error" });
  }
});


app.post("/api/studentSummery/Main_features", async (req, res) => {
  const { studentID } = req.body;

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7); // gives 'YYYY-MM'
	try {
	  const paymentsSummery = (await db.ref(`eduSpace/Student/${studentID}/Payments/${currentMonth}`).once('value')).val();

		let paidAmount = 0;
		let pendingAmount = 0;
		if (paymentsSummery) {
		  Object.values(paymentsSummery).forEach(payment => {
			const amount = Number(payment.Amount) || 0;

			if (payment.Status === 'Paid') {
			  paidAmount += amount;
			} else if (payment.Status === 'Pending') {
			  pendingAmount += amount;
			}
		  });
		}
	  let obj; // Declare here

	  obj = {
		  CourseCount: (await db.ref(`eduSpace/Student/${studentID}/Products`).once('value')).val().length,
		  pending: pendingAmount,
		  paid: paidAmount,
		};

	  res.json({ summery: obj });
	} catch (error) {
	  console.error("Error fetching payments:", error);
	  res.status(500).json({ message: "Server error" });
	}

});

app.post("/api/teacherSummery/", async (req, res) => {
  const { teacherId } = req.body;

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7); // gives 'YYYY-MM'
  console.log((await db.ref(`eduSpace/Teacher/${teacherId}/products`).once('value')).val());
  try {
	const obj = {
		StudentCount: (await db.ref(`eduSpace/Teacher/${teacherId}/Students`).once('value')).val().length,
		CourseCount: (await db.ref(`eduSpace/Teacher/${teacherId}/products`).once('value')).val().length,
		Total: (await db.ref(`eduSpace/TeachersPayments/${teacherId}/${currentMonth}`).once('value')).val().Total,
		eduSpaceCommision: (await db.ref(`eduSpace/TeachersPayments/${teacherId}/${currentMonth}`).once('value')).val().eduSpaceCommision,
		StudentEnrollment: await getLast6MonthsEnrollments(teacherId, now),
		Revenue: await getLast6MonthsRevenue(teacherId, now),
		log: [],
		chart: [],//await getProductDetails()
	}
    res.json({summery: obj });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/teacherSummery/student_enrollment", async (req, res) => {
  const { teacherId } = req.body;

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7); // gives 'YYYY-MM'
  try {
	
    res.json({student_enrollment_summery: await getLast6MonthsEnrollments(teacherId, now), });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/teacherSummery/revenue", async (req, res) => {
  const { teacherId } = req.body;

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7); // gives 'YYYY-MM'
  try {
	
    res.json({revenue_summery: await getLast6MonthsRevenue(teacherId, now), });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ message: "Server error" });
  }
});


app.post("/api/student/enrolled_courses", async (req, res) => {
  const { studentID } = req.body;

  try {
    // Step 1: Get all product IDs for this student
    const productIDs = (
      await db.ref(`eduSpace/Student/${studentID}/Products`).once("value")
    ).val();

    if (!productIDs) {
      return res.json({ orders: [] });
    }


    // Step 2: Fetch all products in parallel
    const productPromises = productIDs.map(async (productId) => {
      const productSnap = await db.ref(`eduSpace/Products/${productId}`).once("value");
      const productData = productSnap.val();

      if (!productData) return null;

      // Step 3: Fetch teacher details using TeacherID
      const teacherSnap = await db
        .ref(`eduSpace/Teacher/${productData.TeacherID}`)
        .once("value");
      const teacherData = teacherSnap.val();

      // Step 4: Construct final course object
      return {
        id: productId,
        name: productData.name || "N/A",
        price: productData.price || "N/A",
        teacherID: productData.TeacherID || "N/A",
		registeredAt: ((await db.ref(`eduSpace/StudentEnrollmentsLog/${studentID}/${productId}`).once("value")).val()).split("T")[0] || "N/A",
        teacherName: teacherData
          ? `${teacherData.firstName || ""} ${teacherData.lastName || ""}`.trim()
          : "Unknown",
      };
    });

    const obj = (await Promise.all(productPromises)).filter(Boolean);

    // Step 5: Return final list
    res.json({ orders: obj });
  } catch (error) {
    console.error("Error fetching enrolled courses:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.get('/api/testemail/', (req, res) => {
	const transporter = nodemailer.createTransport({
		host: "smtp-relay.brevo.com",
		port: 587, // use 587 if you prefer STARTTLS
		secure: false, // true for 465, false for 587
		auth: {
		  user: "9b254e001@smtp-brevo.com",  // must match Zoho account
		  pass: "RxW4rhTjk0z6fSQp"     // app password, not your login password
		},
		tls: {
			rejectUnauthorized: false
		}
	});
	var mailOptions = {
	  from: '9b254e001@smtp-brevo.com',
	  to: 'prageethpramuditha.20162@gmail.com',
	  subject: 'Confirmation of Course Counsultant Interview Participation',
	  text: "",
	  html : '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OTP Email Template</title></head><body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 0; margin: 0;"><div style="background-color: #ffffff; border-radius: 8px; padding: 20px; margin: 30px auto; box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1); max-width: 600px; text-align: center;"><div><img src="cid:unique@prageethTest.ee" style="width: 200px; height: 80px;"></div><div><i class="fas fa-envelope-open" style="font-size: 35px !important; color: #ffffff;"></i></div></div><h2>Hello, Prageeth Pramuditha</h2><p>Your One-Time Password (OTP) for verification is:</p><div style="font-size: 24px; font-weight: bold; background-color: #f8f9fa; padding: 15px; text-align: center; border-radius: 8px; border: 1px dashed #007bff; color: #007bff;">557623</div><p style="margin-top: 20px;">Please use this OTP to complete your verification. The OTP is valid for the next 10 minutes.</p> <div style="color: #6c757d; font-size: 14px; text-align: center; margin-top: 20px;"><p>If you did not request this OTP, please <a href="#" style="color: #007bff; text-decoration: none;">contact us</a> immediately.</p><p>Thank you,<br>The eClub Business College IT Team</p></div></div></body></html>',
	  
	};

	transporter.sendMail(mailOptions, function(error, info){
	  if (error) {
		console.log(error);
	  } else {
		console.log('Email sent: ' + info.response);
		res.send("Success");
	  }
	})
});


app.post("/api/student/get_announcements", async (req, res) => {
  const { studentID } = req.body;

  try {
    // 1️⃣ Get the student's enrolled products
    const productsList = (await db.ref(`eduSpace/Student/${studentID}/Products/`).once("value")).val();

    // If no products, return empty
    if (!productsList) {
      return res.json({ announcements: [] });
    }

    const announcementsArray = [];

    // 3️⃣ Fetch announcements for each product
    for (const productID of productsList) {
      const productAnnouncements = (await db.ref(`eduSpace/Announcement/${productID}`).once("value")).val();

      // 4️⃣ If announcements exist, push them to the array
      if (productAnnouncements) {
        Object.entries(productAnnouncements).forEach(([id, announcement]) => {
          announcementsArray.push(
            announcement
          );
        });
      }
    }

    // 5️⃣ Send combined array
    res.json({ announcements: announcementsArray });

  } catch (error) {
    console.error("Error fetching announcements:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.post('/api/edu/form', async (req, res) => {
	console.log("called");
  try {
	  await db.ref('Leads/').push(req.body);
      res.status(200).send({ success: true });
    
  } catch (error) {
    console.error(error);
    res.status(200).send({ success: false, message: 'Server error' });
  }
});

app.post('/api/edu/apply', async (req, res) => {
	console.log("called");
  try {
	  await db.ref('Application/Marketing').push(req.body);
      res.status(200).send({ success: true });
    
  } catch (error) {
    console.error(error);
    res.status(200).send({ success: false, message: 'Server error' });
  }
});

app.post('/api/edu/teacher_register', async (req, res) => {
  console.log("called");

  try {
    const ref = await db.ref('Application/Teacher').push(req.body);

    res.status(200).send({
      success: true,
      key: ref.key   // 👈 Firebase generated key
    });

  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: 'Server error'
    });
  }
});


app.post('/api/edu/student_register', async (req, res) => {
  console.log("called");
  try {
    	
	const ref = await db.ref('Application/Student').push(req.body);
    res.status(200).send({
      success: true,
      key: ref.key   // 👈 Firebase generated key
    });

  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: 'Server error'
    });
  }
});


app.get("/zoom/start-url/:meetingId", async (req, res) => {
  const { meetingId } = req.params;

  try {
    const response = await axios.get(
      `https://api.zoom.us/v2/meetings/${meetingId}`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );

    const startUrl = response.data.start_url;

    if (!startUrl) {
      return res.status(404).json({ error: "Start URL not found" });
    }

    res.json({ start_url: startUrl });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch Zoom meeting",
      details: error.response?.data || error.message,
    });
  }
});

app.get('/api/edu/get_teachers_list', async (req, res) => {
  try {
    const snapshot = await db.ref('eduSpace/Teacher').once('value')

    if (!snapshot.exists()) {
      return res.status(200).send({
        success: true,
        data: [],
      })
    }

    const teachersObj = snapshot.val()

    const teachersList = Object.keys(teachersObj).map((key) => ({
      id: key,
      name: teachersObj[key].firstName + " " + teachersObj[key].lastName,
    }))

    res.status(200).send({
      success: true,
      data: teachersList,
    })
  } catch (error) {
    console.error(error)
    res.status(500).send({
      success: false,
      message: 'Server error',
    })
  }
});


app.post('/api/edu/get_student_payment_summary', async (req, res) => {
  const { teacherId, monthRef } = req.body;

  try {
    // Fetch teacher data
    const teacherSnapshot = await db.ref(`eduSpace/Teacher/${teacherId}`).once('value');

    if (!teacherSnapshot.exists()) {
      return res.status(200).send({ success: true, data: [] });
    }

    const teacherData = teacherSnapshot.val();
    const teacherStudents = teacherData.Students || []; // array of student IDs
    const teacherProducts = teacherData.products || []; // array of product IDs

    const response = [];

    // Loop through each student ID
    for (const studentID of teacherStudents) {
      const studentSnapshot = await db.ref(`eduSpace/Student/${studentID}`).once('value');
      if (!studentSnapshot.exists()) continue;

      const studentData = studentSnapshot.val();

      // Fetch student payments for the month
      const paymentsSnapshot = await db
        .ref(`eduSpace/Student/${studentID}/Payments/${monthRef}/`)
        .once('value');

      const studentPayments = paymentsSnapshot.exists() ? paymentsSnapshot.val() : {};

      // Only include products that belong to teacher
      const relevantPayments = Object.keys(studentPayments || {})
        .filter((productID) => teacherProducts.includes(productID))
        .map((productID) => {
          const p = studentPayments[productID];
          return {
            id: p.productId,
            name: p.ProductName || '', // or get name from teacherProducts metadata if needed
            isPaid: p.Status === 'Approved',
			amount: p.actualPaidAmount != null ? p.actualPaidAmount : p.Amount || 0,
            date: p.PaidAt || null,
          };
        });

      if (relevantPayments.length > 0) {
        const totalPaid = relevantPayments.reduce(
		  (sum, p) => sum + (p.isPaid ? Number(p.amount || 0) : 0),
		  0
		);

        response.push({
          id: studentID,
          firstName: studentData.firstName || '',
          lastName: studentData.lastName || '',
          mobile: studentData.mobile || '',
          totalPaid,
          Payments: relevantPayments,
        });
      }
    }

    res.status(200).send({ success: true, data: response });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: 'Server error' });
  }
});




async function addCourse(){
	try {
		// push new user
		const newUserRef = await db.ref("eduSpace/Products").push({
			TeacherID:"-OcnVFFHyY718XRiFlEV",
			createdDate:"2025-11-12",
			name:"English Grade 5",
			price:"0",
			code: 'CC509',
		});
		const id = newUserRef.key;

		await newUserRef.set({
			...req.body,
			id,
		});

		

	} catch (err) {
		
	}
}

// --- Get User Key by Email ---
app.get("/api/edu/get_course/:code", async (req, res) => {
  try {
    const { code } = req.params;
    if (!code) {
      return res.status(400).json({ error: "Course Code is required" });
    }

    const snapshot = await db.ref("eduSpace/Products")
      .orderByChild("code")
      .equalTo(code)
      .once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Get first matching record
    let productKey = null;
    let productData = null;

    snapshot.forEach(child => {
      productKey = child.key;
      productData = child.val();
    });
	
	let teacherName = null;
    let teacherProfile = null;
	let eduLevel = null;
	
	if(productKey !== null){
		const TeacherSnap = await db.ref(`eduSpace/Teacher/${productData.TeacherID}`).once("value");
		const TeacherData = TeacherSnap.val();
		
		teacherName = TeacherData.firstName + " " + TeacherData.lastName;
		teacherProfile = TeacherData.profilePic;
		eduLevel = TeacherData.eduLevel;
	}
    return res.status(200).json({
      success: true,
      key: productKey,
      productData: productData,
	  teacherName,
	  teacherProfile,
	  eduLevel,
    });

  } catch (err) {
    console.error("Error fetching user key:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// --- Get User Key by Email ---
app.get("/api/edu/getUserKey/:email", async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const snapshot = await db.ref("eduSpace/Student")
      .orderByChild("email")
      .equalTo(email)
      .once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get first matching record
    let userKey = null;
    let userData = null;

    snapshot.forEach(child => {
      userKey = child.key;
      userData = child.val();
    });

    return res.status(200).json({
      success: true,
      key: userKey,
      user: userData
    });

  } catch (err) {
    console.error("Error fetching user key:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// --- Get User Key by Email ---
app.get("/api/edu/get_student", async (req, res) => {
  try {
    const snapshot = (await db.ref(`eduSpace/Products/-OcnUpBMA6js-yQNBBQO/Meetings/2025-11-11/85150988027`).once('value')).val();
	await db.ref(`eduSpace/Products/-OcnUlyn89Nt-P1VHQeS/Meetings/2025-11-11/85150988027`).set(snapshot);
	
	return res.send(snapshot);
  } catch (err) {
    console.error("Error fetching user key:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// --- Get User Key by Email ---
app.get("/api/edu/get_user", async (req, res) => {
  try {
    const snapshot = (await db.ref(`eduSpace/User/`).once('value')).val();
	
	return res.send(snapshot);
  } catch (err) {
    console.error("Error fetching user key:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


app.post("/api/edu/genereateToken", (req, res) => {
  try {
    const data = req.body;

    // Convert object → JSON → Base64
    const encoded = Buffer.from(JSON.stringify(data)).toString("base64");

    res.json({
      encoded,
    });
  } catch (err) {
    res.status(400).json({ error: "Encoding failed" });
  }
});

app.post("/api/edu/decode", (req, res) => {
  try {
    const { encoded } = req.body;

    // Convert Base64 → JSON → Object
    const decoded = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8")
    );

    res.json({
      decoded,
    });
  } catch (err) {
    res.status(400).json({ error: "Decoding failed" });
  }
});











async function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// POST /createuser
app.post('/api/eduspace/create_user', async (req, res) => {
  // Check if requester is admin
  /*if (req.user.role !== 'admin') {
    return res.status(403).json({
      message: 'Only admins can create users'
    });
  }*/

  const {
    email,
    password,
    firstName,
    lastName,
    role
  } = req.body;

  try {
    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password
    });

    // Create user data in Realtime Database
    await admin.database().ref(`users/${userRecord.uid}`).set({
      email,
      firstName,
      lastName,
      role,
      isActive: true,
      firstTimeLogin: true,
      createdAt: Date.now(),
      lastLogin: 0,
      accessToken: null,
      tokenExpiry: null,
      forceRefresh: false,
	  isLogOutByAdmin: false,
	  loginInProgress: false,
	  profilePic: 'https://firebasestorage.googleapis.com/v0/b/eclubhr-ffe79.appspot.com/o/933-9332131_profile-picture-default-png.png?alt=media&token=c469c3bb-586b-484f-b3b3-42a461931847',
    });
console.log(userRecord.uid);
    return res.status(201).json({
      success: true,
      uid: userRecord.uid
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});




// POST /auth/password-reset
app.post("/auth/password-reset", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    // 1. Generate Firebase reset link
    const actionCodeSettings = {
      url: "https://yourapp.com/reset-password",
      handleCodeInApp: true,
    };

    const resetLink = await admin
      .auth()
      .generatePasswordResetLink(email, actionCodeSettings);
	
	// Configure email transporter (example: Gmail)
	const transporter = nodemailer.createTransport({
		host: "smtp-relay.brevo.com",
		port: 587, // use 587 if you prefer STARTTLS
		secure: false, // true for 465, false for 587
		auth: {
		  user: "9b254e001@smtp-brevo.com",  // must match Zoho account
		  pass: "RxW4rhTjk0z6fSQp"     // app password, not your login password
		},
		tls: {
			rejectUnauthorized: false
		}
	});

    // 2. Send email using your own sender
    await transporter.sendMail({
      from: `"No Reply" <hr@codestack.lk>`,
      to: email,
      subject: "Reset your password",
      html: `
        <p>You requested to reset your password.</p>
        <p>
          <a href="${resetLink}" style="padding:10px 15px;background:#2563eb;color:#fff;text-decoration:none;border-radius:5px;">
            Reset Password
          </a>
        </p>
        <p>If you did not request this, you can safely ignore this email.</p>
      `,
    });

    res.json({ message: "Password reset email sent" });
  } catch (error) {
    console.error(error);

    // Avoid leaking whether email exists
    res.json({ message: "Password reset email sent" });
  }
});

// Start the server
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
});

