const sql = require("mssql");

const config = {

    user : "USER_DB",
    password : "PASSWORD_DB",
    server: "DB_SERVER",
    database: "DATABASE_NAME",
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