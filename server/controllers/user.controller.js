import "dotenv/config";
import userModel from "../models/user.model.js";
import ErrorHandler from "../utils/ErrorHandler.js";
import { CatchAsyncError } from "../middleware/catchAsyncErrors.js";
import jwt from "jsonwebtoken";
import sendMail from "../utils/sendMail.js";
import {
  accessTokenOptions,
  refreshTokenOptions,
  sendToken,
} from "../utils/tokenOption.js";
import { redis } from "../utils/redis.js";
import { getUserId } from "../services/user.service.js";
import cloudinary from "cloudinary";

// ------------ Registration -------------

export const registrationUser = CatchAsyncError(async (req, res, next) => {
  try {
    const { name, email, password, avatar } = req.body;

    
    const isEmailExist = await userModel.findOne({ email });
    console.log("isExits: ", isEmailExist);
    if (isEmailExist) {
      return next(new ErrorHandler("Email already exists", 400));
    }
    

    const user = { name, email, password, avatar };

    const activationToken = generateActivationToken(user);
    const activationCode = activationToken.activationCode;
    const data = { user: { name: user.name }, activationCode };

    try {
      await sendMail({
        email: user.email,
        subject: "Activate your ELearning account",
        template: "activation-mail.ejs",
        data,
      });

      res.status(201).json({
        success: true,
        message: `Registration successful! Please check your email (${user.email})`,
        activationToken: activationToken.token,
      });
    } catch (error) {
      return next(new ErrorHandler(error.message, 400));
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 400));
  }
});

const generateActivationToken = (user) => {
  const activationCode = Math.floor(1000 + Math.random() * 9000).toString();

  const token = jwt.sign(
    { user, activationCode },
    process.env.JWT_SECRET,
    { expiresIn: "5m" }
  );

  return { token, activationCode };
};

// -------- Activation --------

export const activateUser = CatchAsyncError(async (req, res, next) => {
  try {
    const { activationToken, activationCode } = req.body;

    const newUser = jwt.verify(activationToken, process.env.JWT_SECRET);

    if (newUser.activationCode !== activationCode) {
      return next(new ErrorHandler("Invalid activation code", 400));
    }

    const { name, email, password, avatar } = newUser.user;

    const existUser = await userModel.findOne({ email });
    if (existUser) {
      return next(new ErrorHandler("User already exists", 400));
    }

    await userModel.create({ name, email, password, avatar });

    res.status(201).json({
      success: true,
      message: "Account activated successfully",
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 400));
  }
});

// --------------- Auth --------------

export const loginUser = CatchAsyncError(async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new ErrorHandler("Please enter email and password", 400));
    }

    const user = await userModel.findOne({ email }).select("+password");
    if (!user) {
      return next(new ErrorHandler("Invalid email or password", 401));
    }

    const isPasswordMatched = await user.comparePassword(password);
    if (!isPasswordMatched) {
      return next(new ErrorHandler("Invalid email or password", 401));
    }

    sendToken(user, 200, res);
  } catch (error) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const logoutUser = CatchAsyncError(async (req, res, next) => {
  try {
    res.cookie("access_token", "", { maxAge: 1 });
    res.cookie("refresh_token", "", { maxAge: 1 });

    redis.del(req.user?._id);

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    return next(new ErrorHandler(error.message, 400));
  }
});

// ------- Token & Profile ------

export const updateAccessToken = CatchAsyncError(async (req, res, next) => {
  try {
    const refresh_token = req.cookies.refresh_token;
    const decoded = jwt.verify(refresh_token, process.env.REFRESH_TOKEN);
    const message = "Could not refresh access token. Please login again.";

    if (!decoded) return next(new ErrorHandler(message, 401));

    const session = await redis.get(decoded.id);
    if (!session) return next(new ErrorHandler(message, 404));

    const user = JSON.parse(session);

    const accessToken = jwt.sign({ id: user._id }, process.env.ACCESS_TOKEN, { expiresIn: "5m" });
    const refreshToken = jwt.sign({ id: user._id }, process.env.REFRESH_TOKEN, { expiresIn: "3d" });

    req.user = user;
    res.cookie("access_token", accessToken, accessTokenOptions);
    res.cookie("refresh_token", refreshToken, refreshTokenOptions);

    res.status(200).json({ success: true, accessToken });
  } catch (error) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const getUserInfo = CatchAsyncError(async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) return next(new ErrorHandler("User not found", 401));
    getUserId(userId.toString(), res);
  } catch (error) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const socialAuth = CatchAsyncError(async (req, res, next) => {
  try {
    const { name, email, avatar } = req.body;
    const user = await userModel.findOne({ email });

    if (!user) {
      const newUser = await userModel.create({ name, email, avatar });
      sendToken(newUser, 200, res);
    } else {
      sendToken(user, 200, res);
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const updateUserInfo = CatchAsyncError(async (req, res, next) => {
  try {
    const { name, email, avatar } = req.body;
    const userId = req.user?._id;

    if (!userId) return next(new ErrorHandler("User not found", 401));
    const user = await userModel.findById(userId);
    if (!user) return next(new ErrorHandler("User not found", 401));

    if (email && email !== user.email) {
      const isEmailExists = await userModel.findOne({ email });
      if (isEmailExists) return next(new ErrorHandler("Email already exists", 400));
      user.email = email;
    }

    if (name) user.name = name;
    if (avatar) {
      user.avatar.public_id = avatar.public_id;
      user.avatar.url = avatar.url;
    }

    await user.save();
    await redis.set(user._id, JSON.stringify(user));

    res.status(201).json({ success: true, user, message: "User info updated successfully" });
  } catch (error) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const updateUserPassword = CatchAsyncError(async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return next(new ErrorHandler("Please provide all required fields", 400));

    const user = await userModel.findById(req.user?._id).select("+password");
    if (!user?.password) return next(new ErrorHandler("Password not set for this user", 400));

    const isPasswordMatched = await user.comparePassword(oldPassword);
    if (!isPasswordMatched) return next(new ErrorHandler("Old password is incorrect", 400));

    user.password = newPassword;
    await user.save();
    await redis.set(user._id, JSON.stringify(user));

    res.status(201).json({ success: true, user, message: "Password updated successfully" });
  } catch (error) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const updateProfilePicture = CatchAsyncError(async (req, res, next) => {
  try {
    const { avatar } = req.body;
    const userId = req.user?._id;
    const user = await userModel.findById(userId);

    if (avatar && user) {
      if (user.avatar?.public_id) {
        await cloudinary.v2.uploader.destroy(user.avatar.public_id);
      }
      const myCloud = await cloudinary.v2.uploader.upload(avatar, {
        folder: "avatars",
        width: 150,
      });

      user.avatar = {
        public_id: myCloud.public_id,
        url: myCloud.secure_url,
      };

      await user.save();
      await redis.set(user._id, JSON.stringify(user));

      res.status(201).json({ success: true, user, message: "Profile picture updated successfully" });
    }
  } catch (error) {
    return next(new ErrorHandler(error.message, 400));
  }
});