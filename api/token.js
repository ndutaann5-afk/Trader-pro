export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { code, code_verifier } = req.body;

    if (!code || !code_verifier) {
      return res.status(400).json({
        error: "Missing authorization code or code verifier"
      });
    }

    const response = await fetch(
      "https://auth.deriv.com/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier,
          client_id: process.env.DERIV_CLIENT_ID,
          client_secret: process.env.DERIV_CLIENT_SECRET,
          redirect_uri: "https://trader-pro-uMac.vercel.app/"
        })
      }
    );

    const data = await response.json();

    return res.status(response.status).json(data);

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "OAuth token exchange failed"
    });
  }
}
