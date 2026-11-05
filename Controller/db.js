const sql = require("mssql");

const config = {

    user : "JonaCont",
    password : "Jcont2828",
    server: "localhost",
    database: "DBLLanti_Mas",
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function conn() {
  try{  
    const pool = await sql.connect(config);

    console.log("Base de datos conectado correctamente");

    return pool;
} catch (error){

        console.error("Error, al conectar a la base de datos", error);
    }
}

module.exports = {
    sql, 
    conn
}