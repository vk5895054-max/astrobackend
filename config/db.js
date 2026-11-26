const mongoose = require("mongoose");

const connectDB = async () => {
	if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured");
	await mongoose.connect(process.env.MONGO_URI, {
		maxPoolSize: 20,
		minPoolSize: 5,
		serverSelectionTimeoutMS: 5000,
		socketTimeoutMS: 45000,
	});
	console.log("MongoDB connected");
};

module.exports = connectDB;
