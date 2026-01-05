import https from "https";

const data = JSON.stringify({
  model: "gpt-4.1-mini",
  input: "Say hello in one short sentence"
});

const options = {
  hostname: "api.openai.com",
  path: "/v1/responses",
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "Content-Length": data.length
  }
};

const req = https.request(options, res => {
  console.log("STATUS:", res.statusCode);
  let body = "";
  res.on("data", chunk => body += chunk);
  res.on("end", () => console.log("BODY:", body));
});

req.on("error", e => console.error("ERROR:", e));
req.write(data);
req.end();
