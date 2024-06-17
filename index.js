const port = 4000;
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const { type } = require('os');
const { stringify } = require('querystring');
const SECRET_STRIPE_KEY = "sk_test_51PSHvrRqGoXTbAR2g9lVQfxv4I59xZ91vcJM7zW2uM3KfkfU2ul92AQYslQZREMRGpVdxltAhDxC4wbm7Uh4FVB000NBAqPbrM";
const stripe = require('stripe')(SECRET_STRIPE_KEY);


app.use(express.json());
app.use(cors());

// Database connection for MongoDb
mongoose.connect("mongodb+srv://sourabhmalviya151:supremeuniverse9090@cluster0.s3a3nrh.mongodb.net/Ecommerce-Project");

// API creation for home
app.get("/", (req, res) => {
    res.send("Port is Running Successfully!");
});

// Image Storing engine
const storage = multer.diskStorage({
    destination: './upload/images',
    filename: (req, file, cb) => {
        return cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`)
    }
});

const upload = multer({ storage: storage });


// Creating upload endpoint for uploading images
app.use('/images', express.static("upload/images"));


// Route for upload
app.post("/upload", upload.single('product'), (req, res) => {
    res.json({
        success: 1,
        image_url: `http://localhost:${port}/images/${req.file.filename}`
    });
})

// Creating schema for products
const productSchema = new mongoose.Schema({
    id: {
        type: Number,
        required: [true, 'Hey i need an Id']
    },
    name: {
        type: String,
        required: [true, 'Hey I need some name to store!']
    },
    image: {
        type: String,
        required: [true, 'Could you please provide some image!']
    },
    category: {
        type: String,
        required: true
    },
    new_price: {
        type: Number,
        required: true
    },
    old_price: {
        type: Number,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    available: {
        type: Boolean,
        default: true
    }

});

// Creating Model for products collection
const Product = new mongoose.model('Product', productSchema);


// Endpoint for adding a product
app.post("/addproduct", async (req, res) => {
    const products = await Product.find({});
    const Id = products.length + 1;
    const new_product = new Product({ ...req.body, id: Id });
    await new_product.save();
    console.log(new_product);
    res.json({
        success: 1,
        product: new_product
    });
})

// End point for removing the product
app.post("/removeproduct", async (req, res) => {
    await Product.findOneAndDelete({ _id: req.body.id });
    console.log("Removed the Product successfully!");
    res.json({
        success: 1,
        deleted_product: req.body.name
    });
})


// End point for getting the all products
app.get("/allproducts", async (req, res) => {
    const fetchProducts = await Product.find({});
    console.log("All Products Fetched Successfully!");
    res.send(fetchProducts);
})


// Creating User Schema
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'You need a name']
    },
    email: {
        type: String,
        required: [true, 'Please fill you email'],
        unique: true

    },
    password: {
        type: String,
        required: [true, 'You will some password!']
    },
    cartData: {
        type: Object
    },
    date: {
        type: Date,
        default: Date.now,
    }
});

// User Model
const User = new mongoose.model('User', userSchema);

// Api end point for registering the user
app.post("/signup", async (req, res) => {
    let check = await User.find({ email: req.body.email });
    if (check.length > 0) {
        // already registered with the given email id
        return res.status(400).json({ success: false, errors: "This email address Already exits!" });
    }
    let cart = {};
    for (let i = 0; i < 300; i++) {
        cart[i] = 0;
    }
    const newUser = new User({ ...req.body, cartData: cart });
    await newUser.save();

    // Jwt authentication
    const data = {
        user: {
            id: newUser._id
        }
    }
    const token = jwt.sign(data, 'secret_ecom');
    res.json({
        success: 1,
        token: token
    });
})

// Creating the login route
app.post('/login', async (req, res) => {
    let user = await User.findOne({ email: req.body.email });
    if (user) {
        const passwordCompare = req.body.password === user.password;
        if (passwordCompare) {
            const data = {
                user: {
                    id: user._id
                }
            }

            const token = jwt.sign(data, "secret_ecom");
            res.json({
                success: true,
                token: token
            })
        }
        else {
            res.json({
                success: false,
                errors: "Wrong Password!"
            })
        }
    }
    else {
        res.json({
            success: false,
            errors: "Please Register First!"
        })
    }
})

// creating middle ware for fetching the user from its JWT token
const fetchUser = async (req, res, next) => {
    const token = req.header('auth-token');
    if (!token) {
        res.status(401).send({ error: 'Please login First!' });
    }
    else {
        try {
            const data = jwt.verify(token, "secret_ecom");
            req.user = data.user;
            next();
        } catch (error) {
            res.status(401).send({ errors: "please authenticate a valid token" });
        }
    }

}

// creating an endpoint for add to cart api
app.post("/addtocart", fetchUser, async (req, res) => {
    const foundUser = await User.findOne({ _id: req.user.id });
    foundUser.cartData[req.body.id] += 1;
    await User.findOneAndUpdate({ _id: req.user.id }, foundUser);
    res.json("Added to cart!");
})


//  End point for removing the product from user cart
app.post("/removefromcart", fetchUser, async (req, res) => {
    const foundUser = await User.findOne({ _id: req.user.id });
    const items = foundUser.cartData[req.body.id];
    if (items > 0) {
        foundUser.cartData[req.body.id] -= 1;
        await User.findOneAndUpdate({ _id: req.user.id }, foundUser);
    }

})

// creating an end point for fetching the use cart from database
app.post("/getusercart", fetchUser, async (req, res) => {
    const foundUser = await User.findOne({ _id: req.user.id });
    const userCart = foundUser.cartData;
    res.send(userCart);
})


// creating api endpoint for payment gateway
app.post("/create-checkout-session", async (req, res) => {
    const cartProducts = req.body.cartProducts;
    console.log(cartProducts);
    const lineItems = cartProducts.map((product) => ({
        price_data: {
            currency: 'usd',
            product_data: {
                name: product.name,
                images: ["https://images.unsplash.com/photo-1633526544365-a98d534c9201?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"]
            },
            unit_amount: product.new_price * 100,
        },
        quantity: product.quantity
    }));
    console.log(lineItems);
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: 'payment',
        success_url: "http://localhost:3000/YourOrders",
        cancel_url: "http://localhost:3000/cart"
    }, { apiKey: SECRET_STRIPE_KEY });

    res.json({
        success: 1,
        id: session.id
    });

})


// Creating a route for passing userinfo to frontend
app.post("/getuser", fetchUser, async (req, res) => {
    const userId = req.user.id;
    const user = await User.findOne({ _id: userId });
    res.json({
        success: 1,
        user: user
    });
})

// starting the server
app.listen(port, () => {
    console.log("LISTENNING!");
});



