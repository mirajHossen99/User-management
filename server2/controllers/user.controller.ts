require("dotenv").config();
import e, { Request, Response, NextFunction } from "express";
import userModel, { IUser } from "../models/user.model";
import ErrorHandler from "../utils/ErrorHandler";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import jwt, { JwtPayload } from "jsonwebtoken";
import sendMail from "../utils/sendMail";
import {
  accessTokenOptions,
  refreshTokenOptions,
  sendToken,
} from "../utils/tokenOption";
import { redis } from "../utils/redis";
import { getUserId } from "../services/user.service";
import cloudinary from "cloudinary";

// Register a new user
interface IRegisterBody {
  name: string;
  email: string;
  password: string;
  avatar?: string;
  // avatar?: {
  //     public_id: string;
  //     url: string;
  // }
}

export const registrationUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, password, avatar }: IRegisterBody =
        req.body as IRegisterBody;
      const isEmailExist = await userModel.findOne({ email });
      if (isEmailExist) {
        return next(new ErrorHandler("Email already exists", 400));
      }

      const user: IRegisterBody = {
        name,
        email,
        password,
        avatar,
      };

      const activationToken = generateActivationToken(user);

      const activationCode = activationToken.activationCode;

      const data = { user: { name: user.name }, activationCode };

      /* const html = await ejs.renderFile(
        path.join(__dirname, "../mails/activation-mail.ejs"),
        data
      ); */

      // Save user temporarily in Redis or any temporary storage with activationToken.token as the key (Implementation depends on your Redis setup)

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
      } catch (error: any) {
        return next(new ErrorHandler(error.message, 400));
      }
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

//--------------------------------------------------------------------

// Activation Token
interface IActivationToken {
  token: string;
  activationCode: string;
}

// Generate Activation Token
const generateActivationToken = (user: IRegisterBody): IActivationToken => {
  const activationCode = Math.floor(1000 + Math.random() * 9000).toString();

  const token = jwt.sign(
    {
      user,
      activationCode,
    },
    process.env.JWT_SECRET as string,
    {
      expiresIn: "5m",
    }
  );

  return { token, activationCode };
};

// --------------------------------------------------------------------

// activate user
interface IActivateRequest {
  activationToken: string;
  activationCode: string;
}

export const activateUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { activationToken, activationCode }: IActivateRequest =
        req.body as IActivateRequest;

      // Verify activation token
      const newUser: { user: IUser; activationCode: string } = jwt.verify(
        activationToken,
        process.env.JWT_SECRET as string
      ) as { user: IUser; activationCode: string };

      // Check activation code
      if (newUser.activationCode !== activationCode) {
        return next(new ErrorHandler("Invalid activation code", 400));
      }

      // Distructure user data
      const { name, email, password, avatar } = newUser.user;

      const existUser = await userModel.findOne({ email });
      if (existUser) {
        return next(new ErrorHandler("User already exists", 400));
      }

      const user = await userModel.create({
        name,
        email,
        password,
        avatar,
      });

      res.status(201).json({
        success: true,
        message: "Account activated successfully",
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// --------------------------------------------------------------------

// Login User interface
interface ILoginRequest {
  email: string;
  password: string;
}

// Login User

export const loginUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Destructure email and password
      const { email, password }: ILoginRequest = req.body as ILoginRequest;

      // Validate email and password
      if (!email || !password) {
        return next(new ErrorHandler("Please enter email and password", 400));
      }

      // Check if user exists
      const user = await userModel.findOne({ email }).select("+password");
      if (!user) {
        return next(new ErrorHandler("Invalid email or password", 401));
      }

      // Check if password is correct
      const isPasswordMatched = await user.comparePassword(password);
      if (!isPasswordMatched) {
        return next(new ErrorHandler("Invalid email or password", 401));
      }
      // Send token
      sendToken(user, 200, res);
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

//--------------------------------------------------------------------

// Logout User
export const logoutUser = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Clear cookies
      res.cookie("access_token", "", { maxAge: 1 });
      res.cookie("refresh_token", "", { maxAge: 1 });

      // Remove user session from redis
      redis.del(req.user?._id as any);

      res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

//--------------------------------------------------------------------

// Update access token using refresh token
export const updateAccessToken = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refresh_token = req.cookies.refresh_token as string;

      //
      const decoded = jwt.verify(
        refresh_token,
        process.env.REFRESH_TOKEN as string
      ) as JwtPayload;

      const message = "Could not refresh access token. Please login again.";

      if (!decoded) {
        return next(new ErrorHandler(message, 401));
      }

      const session = await redis.get((decoded as { id: string }).id);

      if (!session) {
        return next(new ErrorHandler(message, 404));
      }

      const user = JSON.parse(session);

      // generate new access token
      const accessToken = jwt.sign(
        { id: user._id },
        process.env.ACCESS_TOKEN as string,
        {
          expiresIn: "5m",
        }
      );

      const refreshToken = jwt.sign(
        { id: user._id },
        process.env.REFRESH_TOKEN as string,
        {
          expiresIn: "3d",
        }
      );

      // Set user in request object
      req.user = user;

      // set cookies for new tokens
      res.cookie("access_token", accessToken, accessTokenOptions);
      res.cookie("refresh_token", refreshToken, refreshTokenOptions);

      res.status(200).json({
        success: true,
        accessToken,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// --------------------------------------------------------------------

// get user info
export const getUserInfo = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?._id;

      if (!userId) {
        return next(new ErrorHandler("User not found", 401));
      }
      getUserId(userId.toString(), res);
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// --------------------------------------------------------------------

interface ISocialAuthBody {
  name: string;
  email: string;
  avatar?: {
    public_id: string;
    url: string;
  };
}

// social auth
export const socialAuth = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, avatar } = req.body as ISocialAuthBody;

      const user = await userModel.findOne({ email });
      if (!user) {
        // create new user
        const newUser = await userModel.create({
          name,
          email,
          avatar,
        });
        sendToken(newUser, 200, res);
      } else {
        // login existing user
        sendToken(user, 200, res);
      }
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// --------------------------------------------------------------------

// update user info
interface IUpdateUserInfo {
  name?: string;
  email?: string;
  avatar?: {
    public_id: string;
    url: string;
  };
}

export const updateUserInfo = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, avatar }: IUpdateUserInfo =
        req.body as IUpdateUserInfo;

      const userId = req.user?._id;

      // userId check
      if (!userId) {
        return next(new ErrorHandler("User not found", 401));
      }

      // find user by id
      const user = await userModel.findById(userId);

      // check if user exists
      if (!user) {
        return next(new ErrorHandler("User not found", 401));
      }

      // check if email already exists
      if (email && user) {
        if (email !== user.email) {
          const isEmailExists = await userModel.findOne({ email });

          if (isEmailExists) {
            return next(new ErrorHandler("Email already exists", 400));
          }
          user.email = email;
        }
      }

      // update name
      if (name && user) {
        if (name !== user.name) {
          user.name = name;
        }
      }

      // update avatar
      if (avatar && user) {
        user.avatar.public_id = avatar?.public_id;
        user.avatar.url = avatar?.url;
      }

      // save updated user
      await user?.save();

      // update session in redis
      await redis.set(user._id as any, JSON.stringify(user) as any);

      res.status(201).json({
        success: true,
        user,
        message: "User info updated successfully",
      });
    } catch (error) {
      return next(new ErrorHandler((error as Error).message, 400));
    }
  }
);

// --------------------------------------------------------------------

// update user password
interface IUpdatePassword {
  oldPassword: string;
  newPassword: string;
}

export const updateUserPassword = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { oldPassword, newPassword }: IUpdatePassword =
        req.body as IUpdatePassword;

      // validate passwords input
      if (!oldPassword || !newPassword) {
        return next(
          new ErrorHandler("Please provide all required fields", 400)
        );
      }

      const user = await userModel.findById(req.user?._id).select("+password");

      // check if password is set
      if (user?.password === undefined) {
        return next(new ErrorHandler("Password not set for this user", 400));
      }

      const isPasswordMatched = await user?.comparePassword(oldPassword);

      // check if old password matches
      if (!isPasswordMatched) {
        return next(new ErrorHandler("Old password is incorrect", 400));
      }

      // update to new password
      user.password = newPassword;

      // save updated user
      await user.save();

      // update session in redis
      await redis.set(user._id as any, JSON.stringify(user) as any);

      res.status(201).json({
        success: true,
        user,
        message: "Password updated successfully",
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);

// --------------------------------------------------------------------

interface IUpdateProfilePicture {
  avatar: {
    public_id: string;
    url: string;
  };
}

// update profile picture (Avatar)
export const updateProfilePicture = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { avatar }: IUpdateProfilePicture =
        req.body as IUpdateProfilePicture;

      const userId = req.user?._id;

      const user = await userModel.findById(userId);

      // check if user and avatar exist
      if (avatar && user) {
        if (user.avatar && user.avatar.public_id) {
          // Delete previous avatar from cloudinary
          await cloudinary.v2.uploader.destroy(user.avatar.public_id);

        }
        // Upload new avatar to cloudinary
        const myCloud = await cloudinary.v2.uploader.upload(avatar as any, {
          folder: "avatars",
          width: 150,
        });

        // update user avatar
        user.avatar = {
          public_id: myCloud.public_id,
          url: myCloud.secure_url,
        };

        await user.save();

        // update session in redis
        await redis.set(user._id as any, JSON.stringify(user) as any);

        res.status(201).json({
          success: true,
          user,
          message: "Profile picture updated successfully",
        });
      }
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  }
);
