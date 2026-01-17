require("dotenv").config();
import { app } from "./app";
import cloudinary from "cloudinary";
import connectDB from "./utils/db";

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// create server
app.listen(process.env.PORT, () => {
    console.log(`Server is connected with port: ${process.env.PORT}`);
    connectDB();
})
