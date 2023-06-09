const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypr = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();

const databasePath = path.join(__dirname, "twitterClone.db");

app.use(express.json());

let database = null;

const initializeDBandServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};
initializeDBandServer();

/* API - 1 Path: `/register/ */
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUser = `SELECT username FROM user WHERE username = '${username}';`;
  const dbUser = await database.get(checkUser);
  console.log(dbUser);

  if (dbUser !== undefined) {
    /* Scenario 1  If the username already exists */
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      /* Scenario 2  If the registrant provides a password with less than 6 characters*/
      response.status(400);
      response.send("Password is too short");
    } else {
      /* Scenario 3  Successful registration of the registrant*/
      const hashedPassword = await bcrypr.hash(password, 10);
      const postUserQuery = `
          INSERT INTO
            user (username, password, name, gender)
          VALUES
            ('${username}', '${hashedPassword}', '${name}', '${gender}');
        `;
      await database.run(postUserQuery);
      response.send("User created successfully");
    }
  }
});

/* API - 1 Path: `/login/` */
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkTwitterUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const twitterUser = await database.get(checkTwitterUserQuery);

  if (twitterUser !== undefined) {
    const checkPassword = await bcrypr.compare(password, twitterUser.password);
    if (checkPassword === true) {
      /* Scenario 3  Successful login of the user */
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "secret_key");
      response.send({ jwtToken });
    } else {
      /* Scenario 2  If the user provides an incorrect password */
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    /* Scenario 1  If the user doesn't have a Twitter account */
    response.status(400);
    response.send("Invalid user");
  }
});

// part of API - 2 Authentication with JWT Token */
const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }

  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "secret_key", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

/* API - 3 Path: `/user/tweets/feed/`  Returns the latest tweets of people whom the user follows. Return 4 tweets at a time */
app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    /** get user id from username  */
    let { username } = request;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const getUserId = await database.get(getUserIdQuery);
    //console.log(getUserId);
    /** get followers ids from user id  */
    const getFollowerIdsQuery = `select following_user_id from follower 
    where follower_user_id=${getUserId.user_id};`;
    const getFollowerIds = await database.all(getFollowerIdsQuery);
    // console.log(getFollowerIds);
    //get follower ids array
    const getFollowerIdsSimple = getFollowerIds.map((eachUser) => {
      return eachUser.following_user_id;
    });
    // console.log(getUserIds);
    // console.log(`${getUserIds}`);
    //query
    const getTweetQuery = `select user.username, tweet.tweet, tweet.date_time as dateTime 
      from user inner join tweet 
      on user.user_id= tweet.user_id where user.user_id in (${getFollowerIdsSimple})
       order by tweet.date_time desc limit 4 ;`;
    const responseResult = await database.all(getTweetQuery);
    //console.log(responseResult);
    response.send(responseResult);
  }
);

/* API - 4 Path: `/user/following/` Returns the list of all names of people whom the user follows */
app.get("/user/following/", authenticationToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  // console.log(getUserId);
  const getFollowerIdsQuery = `select following_user_id from follower 
    where follower_user_id=${getUserId.user_id};`;
  const getFollowerIdsArray = await database.all(getFollowerIdsQuery);
  //console.log(getFollowerIdsArray);
  const getFollowerIds = getFollowerIdsArray.map((eachUser) => {
    return eachUser.following_user_id;
  });
  //console.log(`${getFollowerIds}`);
  const getFollowersResultQuery = `select name from user where user_id in (${getFollowerIds});`;
  const responseResult = await database.all(getFollowersResultQuery);
  //console.log(responseResult);
  response.send(responseResult);
});

/* API - 5 Path: `/user/followers/`  Returns the list of all names of people who follows the user */
app.get("/user/followers/", authenticationToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  //console.log(getUserId);
  const getFollowerIdsQuery = `select follower_user_id from follower where following_user_id=${getUserId.user_id};`;
  const getFollowerIdsArray = await database.all(getFollowerIdsQuery);
  console.log(getFollowerIdsArray);
  const getFollowerIds = getFollowerIdsArray.map((eachUser) => {
    return eachUser.follower_user_id;
  });
  console.log(`${getFollowerIds}`);
  //get tweet id of user following x made
  const getFollowersNameQuery = `select name from user where user_id in (${getFollowerIds});`;
  const getFollowersName = await database.all(getFollowersNameQuery);
  //console.log(getFollowersName);
  response.send(getFollowersName);
});

/* API - 6 Path: `/tweets/:tweetId/` If the user requests a tweet other than the users he is following */
const api6Output = (tweetData, likesCount, replyCount) => {
  return {
    tweet: tweetData.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetData.date_time,
  };
};

app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { tweetId } = request.params;
  //console.log(tweetId);
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  // console.log(getUserId);
  //get the ids of whom the use is following
  const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`;
  const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
  //console.log(getFollowingIdsArray);
  const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
    return eachFollower.following_user_id;
  });
  //console.log(getFollowingIds);
  //get the tweets made by the users he is following
  const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`;
  const getTweetIdsArray = await database.all(getTweetIdsQuery);
  const followingTweetIds = getTweetIdsArray.map((eachId) => {
    return eachId.tweet_id;
  });
  // console.log(followingTweetIds);
  //console.log(followingTweetIds.includes(parseInt(tweetId)));
  if (followingTweetIds.includes(parseInt(tweetId))) {
    const likes_count_query = `select count(user_id) as likes from like where tweet_id=${tweetId};`;
    const likes_count = await database.get(likes_count_query);
    //console.log(likes_count);
    const reply_count_query = `select count(user_id) as replies from reply where tweet_id=${tweetId};`;
    const reply_count = await database.get(reply_count_query);
    // console.log(reply_count);
    const tweet_tweetDateQuery = `select tweet, date_time from tweet where tweet_id=${tweetId};`;
    const tweet_tweetDate = await database.get(tweet_tweetDateQuery);
    //console.log(tweet_tweetDate);
    response.send(api6Output(tweet_tweetDate, likes_count, reply_count));
  } else {
    response.status(401);
    response.send("Invalid Request");
    console.log("Invalid Request");
  }
});

/* API - 7 Path: `/tweets/:tweetId/likes/  If the user requests a tweet other than the users he is following */
const convertLikedUserNameDBObjectToResponseObject = (dbObject) => {
  return {
    likes: dbObject,
  };
};
app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    //console.log(tweetId);
    let { username } = request;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const getUserId = await database.get(getUserIdQuery);
    //console.log(getUserId);
    //get the ids of whom thw use is following
    const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`;
    const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
    //console.log(getFollowingIdsArray);
    const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
      return eachFollower.following_user_id;
    });
    //console.log(getFollowingIds);
    //check is the tweet ( using tweet id) made by his followers
    const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`;
    const getTweetIdsArray = await database.all(getTweetIdsQuery);
    const getTweetIds = getTweetIdsArray.map((eachTweet) => {
      return eachTweet.tweet_id;
    });
    //console.log(getTweetIds);
    //console.log(getTweetIds.includes(parseInt(tweetId)));
    if (getTweetIds.includes(parseInt(tweetId))) {
      const getLikedUsersNameQuery = `select user.username as likes from user inner join like
       on user.user_id=like.user_id where like.tweet_id=${tweetId};`;
      const getLikedUserNamesArray = await database.all(getLikedUsersNameQuery);
      //console.log(getLikedUserNamesArray);
      const getLikedUserNames = getLikedUserNamesArray.map((eachUser) => {
        return eachUser.likes;
      });
      // console.log(getLikedUserNames);
      /*console.log(
        convertLikedUserNameDBObjectToResponseObject(getLikedUserNames)
      );*/
      response.send(
        convertLikedUserNameDBObjectToResponseObject(getLikedUserNames)
      );
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

/* API - 8 Path: `/tweets/:tweetId/replies/`  If the user requests a tweet other than the users he is following */
const convertUserNameReplyedDBObjectToResponseObject = (dbObject) => {
  return {
    replies: dbObject,
  };
};
app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  async (request, response) => {
    //tweet id of which we need to get reply's
    const { tweetId } = request.params;
    console.log(tweetId);
    //user id from user name
    let { username } = request;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const getUserId = await database.get(getUserIdQuery);
    // console.log(getUserId);
    //get the ids of whom the user is following
    const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`;
    const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
    //console.log(getFollowingIdsArray);
    const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
      return eachFollower.following_user_id;
    });
    console.log(getFollowingIds);
    //check if the tweet ( using tweet id) made by the person he is  following
    const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`;
    const getTweetIdsArray = await database.all(getTweetIdsQuery);
    const getTweetIds = getTweetIdsArray.map((eachTweet) => {
      return eachTweet.tweet_id;
    });
    console.log(getTweetIds);
    //console.log(getTweetIds.includes(parseInt(tweetId)));
    if (getTweetIds.includes(parseInt(tweetId))) {
      //get reply's
      //const getTweetQuery = `select tweet from tweet where tweet_id=${tweetId};`;
      //const getTweet = await database.get(getTweetQuery);
      //console.log(getTweet);
      const getUsernameReplyTweetsQuery = `select user.name, reply.reply from user inner join reply on user.user_id=reply.user_id
      where reply.tweet_id=${tweetId};`;
      const getUsernameReplyTweets = await database.all(
        getUsernameReplyTweetsQuery
      );
      //console.log(getUsernameReplyTweets);
      /* console.log(
        convertUserNameReplyedDBObjectToResponseObject(getUsernameReplyTweets)
      );*/

      response.send(
        convertUserNameReplyedDBObjectToResponseObject(getUsernameReplyTweets)
      );
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

/* API - 9 Path: `/user/tweets/`   Returns a list of all tweets of the user */
app.get("/user/tweets/", authenticateUser, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await database.get(selectUserQuery);
  const { user_id } = dbUser;
  //   const user_id = 4;
  const getTweetsQuery = `
  SELECT * FROM tweet WHERE user_id = ${user_id}
  ORDER BY tweet_id;
  `;
  const tweetObjectsList = await database.all(getTweetsQuery);

  const tweetIdsList = tweetObjectsList.map((object) => {
    return object.tweet_id;
  });

  const getLikesQuery = `
    SELECT COUNT(like_id) AS likes FROM like 
    WHERE tweet_id IN (${tweetIdsList}) GROUP BY tweet_id
    ORDER BY tweet_id;
    `;
  const likesObjectsList = await database.all(getLikesQuery);
  const getRepliesQuery = `
    SELECT COUNT(reply_id) AS replies FROM reply 
    WHERE tweet_id IN (${tweetIdsList}) GROUP BY tweet_id
    ORDER BY tweet_id;
    `;
  const repliesObjectsList = await database.all(getRepliesQuery);
  response.send(
    tweetObjectsList.map((tweetObj, index) => {
      const likes = likesObjectsList[index] ? likesObjectsList[index].likes : 0;
      const replies = repliesObjectsList[index]
        ? repliesObjectsList[index].replies
        : 0;
      return {
        tweet: tweetObj.tweet,
        likes,
        replies,
        dateTime: tweetObj.date_time,
      };
    })
  );
});

/* API - 10 Path: `/user/tweets/`  Create a tweet in the tweet table */
app.post("/user/tweets/", authenticationToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  //console.log(getUserId.user_id);
  const { tweet } = request.body;
  //console.log(tweet);
  //const currentDate = format(new Date(), "yyyy-MM-dd HH-mm-ss");
  const currentDate = new Date();
  console.log(currentDate.toISOString().replace("T", " "));

  const postRequestQuery = `insert into tweet(tweet, user_id, date_time) values ("${tweet}", ${getUserId.user_id}, '${currentDate}');`;

  const responseResult = await database.run(postRequestQuery);
  const tweet_id = responseResult.lastID;
  response.send("Created a Tweet");
});

/*
//to check if the tweet got updated
app.get("/tweets/", authenticationToken, async (request, response) => {
  const requestQuery = `select * from tweet;`;
  const responseResult = await database.all(requestQuery);
  response.send(responseResult);
});*/

//deleting the tweet

/* API - 11 Path: `/tweets/:tweetId/` If the user requests to delete a tweet of other users */
app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    //console.log(tweetId);
    let { username } = request;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const getUserId = await database.get(getUserIdQuery);
    //console.log(getUserId.user_id);
    //tweets made by the user
    const getUserTweetsListQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`;
    const getUserTweetsListArray = await database.all(getUserTweetsListQuery);
    const getUserTweetsList = getUserTweetsListArray.map((eachTweetId) => {
      return eachTweetId.tweet_id;
    });
    console.log(getUserTweetsList);
    if (getUserTweetsList.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `delete from tweet where tweet_id=${tweetId};`;
      await database.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
