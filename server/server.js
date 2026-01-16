import "dotenv/config";
import { app } from "./app.js";
import connectDB from "./utils/db.js";


// create server

const port = process.env.PORT || 5000;
app.listen(process.env.PORT, () => {
    console.log(`Server is connected with port: ${port}`);
    connectDB();
})