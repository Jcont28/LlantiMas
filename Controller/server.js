const express = require("express");
const cors = require("cors");
const path = require("path");

const {sql, conn} = require("./db");
const { pool, Transaction, PreparedStatement } = require("mssql");
const { pathToFileURL } = require("url");
const { findPackageJSON } = require("module");
const { resolveObjectURL } = require("buffer");
const { compose } = require("stream");
const { escape } = require("querystring");
const { error } = require("console");


const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());


app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../View/Login.html"));
});

app.use(express.static(path.join(__dirname, "../View")));

app.post("/Index.html", async(req, res) =>{

    try{
        const {usuario, password } = req.body;

        const pool = await conn();

        const resul = await pool.request()
        .input("usuario", sql.VarChar, usuario)
        .input("password", sql.VarChar, password )
        .query(
                `Select * from usuariosLlantiMas where usuario = @usuario and password = @password`
        );

        if(resul.recordset.length === 0)
        {
            return res.status(401).json({
                success: false,
                mensaje: "Usuario o contraseña incorrectos"
            });
        }


        const usuarioDB = resul.recordset[0];
        console.log("Usuario Autenticado: ", usuarioDB.usuario);

        res.json({
            success: true,
            mensaje: "Inicio de sesión correcto",
            usuario: usuarioDB.Nombre_Usuario
        });
    } catch (error){
        console.log("Error al iniciar sesión", error);

        res.status(500).json({
            success: false,
            mensaje: "Error interno del servidor"
        });
    }
});


app.get("/dashboard", async (req, res) => {

    try{
        const pool = await conn();

        const productos = await pool.request().query(
            `Select count(*) as Total from Productos`
        );

        const clientes = await pool.request().query(
            `Select count(*) as Total from Clientes`
        );


        const ventas = await pool.request().query(
            `Select count(*) as Total from Ventas`
        );

        res.json({
            productos: productos.recordset[0].Total,
            clientes: clientes.recordset[0].Total,
            ventas: ventas.recordset[0].Total
        });

    } catch (error){
        console.error("Erros Dasboard: ", error);

        res.status(500).json({
            success: false,
            mensaje: "Error al obtener informacion",
            error: error.message
        });
    }
});


app.get("/producto", async (req, res) => { 
    try{ const pool = await conn(); 

        const resultado = await pool.request()
        .query(`Select P.ProductoID, P.Nombre, P.Precio, P.Stock, Cat.NombreCategoria as Categoria, P.Estado,
            N.Numeracion from Productos P
            inner join Numeracion N on P.NumeracionID = N.NumeracionID
            inner join Categorias Cat on P.CategoriaID = Cat.CategoriaID`); 
        
        res.json(resultado.recordset); 
}catch(error){ 
    console.log("Error al obtener los productos: ", error); 
    res.status(500).json({ 
        success: false, 
        mensaje: "Error al obtener productos", 
        error: error.message });
    } 
});

app.get("/producto/Producto/:id", async (req, res) =>{
    try{
        const pool = await conn();

        const resultado = await pool.request()
        .input("ProductoID", sql.Int, req.params.id)
        .query(`Select ProductoID, Nombre, Precio, Stock from Productos where ProductoID = @ProductoID`);

        if(resultado.recordset.length === 0){
            return res.status(404).json({
                success: false,
                mensaje: "No se encontro el producto"
            });
        }

        res.json(resultado.recordset[0]);
    }catch (error){
        console.error("Error al obtener el precio: ", error);

        res.status(500).json({

            success: false,
            mensaje: "Error al obtener el precio",
            error: error.message
        });
    }
});



app.patch("/producto/:id", async (req, res) =>{
    try{
        const id = req.params.id;

        const pool = await conn();

        await pool.request().input("id", sql.Int, id)
        .query(`Update Productos set Estado = 0 where ProductoID = @id`);

        res.json({
            success: true,
            mensaje: "Producto desactivado correctamente"
        });
    }catch (error){
        console.log("Error al desactivar Producto", error);

        res.status(500).json({
            success: false,
            mensaje: "Error al desactivar Producto",
            error: error.message
        });
    }
});


app.put("/producto/:id", async (req, res)=> {
    try{
        const id = req.params.id;

        const {Nombre, Precio, NumeracionID, Stock, CategoriaID, Estado} = req.body;
        const pool = await conn();

        await pool.request()
            .input("id", sql.Int, id)
            .input("Nombre", sql.VarChar, Nombre)
            .input("Precio", sql.Decimal(10,2), Precio)
            .input("NumeracionID", sql.Int, NumeracionID)
            .input("Stock", sql.Int, Stock)
            .input("CategoriaID", sql.Int, CategoriaID)
            .input("Estado", sql.VarChar, Estado)
            .query(`Update Productos set Nombre = @Nombre, Precio = @Precio, NumeracionID = @NumeracionID,
                Stock = @Stock, CategoriaID = @CategoriaID, Estado = @Estado where ProductoID = @id`);

                res.json({
                    success:true,
                    mensaje: "Producto actualizado correctamente"
                });
    }catch(error){
        console.log("Error al actualizar el producto", error);
        res.status(500).json({
            success: false,
            mensaje: "Error al actualizar producto",
            error: error.message
        });
    }
});


app.post("/producto", async(req, res)=>{

    
    try{
        const {Nombre, Precio, NumeracionID, Stock, CategoriaID, Estado} = req.body;

        console.log("Datos recibidos:", req.body);
        if(!Nombre || !Precio || !NumeracionID || !Stock || !CategoriaID || !Estado ){
            return res.status(400).json({
                success: false,
                mensaje: "Todos los campos son obligatorios"
            });
        }

        const pool = await conn();
        const transaction = new sql.Transaction(pool);

        await transaction.begin();


        try{
            const numeracion = await  transaction.request()

                .input("Numeracion", sql.NVarChar(100), NumeracionID)
                .query(`Select top 1 NumeracionID from Numeracion where Numeracion = @Numeracion`);

                let idnumeracion; 

                if(numeracion.recordset.length === 0)
                {
                    const nuevaNumeracion = await transaction.request()
                    .input("Numeracion", sql.NVarChar(100), NumeracionID)
                    .query(`Insert into Numeracion(Numeracion) OUTPUT INSERTED.NumeracionID 
                        Values(@Numeracion)`);

                        idnumeracion = nuevaNumeracion.recordset[0].NumeracionID;
                        
                }else{
                        idnumeracion = numeracion.recordset[0].NumeracionID;
                       
                }

                    
                
                        const categoria = await  transaction.request()

                        .input("NombreCategoria", sql.VarChar(100), CategoriaID)
                        .query(`Select top 1 CategoriaID from Categorias where NombreCategoria = @NombreCategoria`);

                        let idcategoria; 

                        if(categoria.recordset.length === 0)
                        {
                         const nuevaCategoria = await transaction.request()
                            .input("NombreCategoria", sql.VarChar(100), CategoriaID)
                            .input("EstadoCategoria", sql.VarChar(100), 'Activo')
                            .query(`Insert into Categorias(NombreCategoria, Estado) OUTPUT INSERTED.CategoriaID 
                             Values(@NombreCategoria, @EstadoCategoria)`);

                                idcategoria = nuevaCategoria.recordset[0].CategoriaID;
                                
                        
                    }else{
                                idcategoria = categoria.recordset[0].CategoriaID;
                       
                    }

                 


            const  producto = await transaction.request()
            .input("Nombre", sql.VarChar, Nombre)
            .input("Precio", sql.Decimal(10,2), Precio)
            .input("NumeracionID", sql.Int, idnumeracion)
            .input("Stock", sql.Int, Stock)
            .input("CategoriaID", sql.Int, idcategoria)
            .input("Estado", sql.VarChar, Estado)
            .query(`Insert into Productos (Nombre, Precio, NumeracionID, Stock, CategoriaID, Estado) OUTPUT INSERTED.ProductoID values
             (@Nombre, @Precio, @NumeracionID, @Stock, @CategoriaID, @Estado)`
            );
       

         const ProductoID = producto.recordset[0].ProductoID;

            await transaction.commit();
            res.json({
            success: true,
            mensaje: "Producto registrado correctamente"
            
        });
        
        
    }catch(error){
        await transaction.rollback();
        throw error;
    }

} catch(error){

             console.error("Error al registrar producto:", error);
            res.status(500).json({
            success: false,
            mensaje: "Error al registrar producto",
            error: error.message
        });
    }
});







/*Cliente*/

app.get("/cliente", async (req, res) => {

    try{

        const pool = await conn();

        const resulta = await pool.request().query(`Select * from Clientes where Estado = 1`);

        res.json(resulta.recordset);
    } catch (error){
        console.log("Error al obtener los clientes", error);

        res.status(500).json({
            success: false,
            mensaje: "Errpr al obtener los clientes",
            error: error.message
        })
    }

});

app.patch("/Cliente/:id", async (req, res) =>{
    try{
        const id = req.params.id;

        const pool = await conn();

        await pool.request().input("id", sql.Int, id)
        .query(`Update Clientes set Estado = 0 where ClienteID = @id`);

        res.json({
            success: true,
            mensaje: "Cliente desactivado correctamente"
        });
    }catch (error){
        console.log("Error al desactivar cliente", error);

        res.status(500).json({
            success: false,
            mensaje: "Error al desactivar cliente",
            error: error.message
        });
    }
});


app.put("/Cliente/:id", async (req, res)=> {
    try{
        const id = req.params.id;

        const {Nombre, Telefono, Direccion} = req.body;
        const pool = await conn();

        await pool.request()
            .input("id", sql.Int, id)
            .input("Nombre", sql.VarChar, Nombre)
            .input("Telefono", sql.VarChar, Telefono)
            .input("Direccion", sql.VarChar, Direccion)
            .query(`Update Clientes set Nombre = @Nombre, Telefono = @Telefono, 
                Direccion = @Direccion where ClienteID = @id`);

                res.json({
                    success:true,
                    mensaje: "Cliente actualizado correctamente"
                });
    }catch(error){
        console.log("Error al actualizar el cliente", error);
        res.status(500).json({
            success: false,
            mensaje: "Error al actualizar cliente",
            error: error.message
        });
    }
});


app.post("/Cliente", async(req, res)=>{

    try{
        const {Nombre, Telefono, Direccion} = req.body;

        if(!Nombre || !Telefono || !Direccion){
            return res.status(400).json({
                success: false,
                mensaje: "Todos los campos son obligatorios"
            });
        }

        const pool = await conn();

        await pool.request()
        .input("Nombre", sql.VarChar, Nombre)
        .input("Telefono", sql.VarChar, Telefono)
        .input("Direccion", sql.VarChar, Direccion)
        .query(`Insert into Clientes (Nombre, Telefono, Direccion, Estado) values
            (@Nombre, @Telefono, @Direccion, 1)`
        );
        res.json({
            success: true,
            mensaje: "Cliente registrado correctamente"
        });
    }catch(error){
        res.status(500).json({
            success: false,
            mensaje: "Error al registrar Cliente",
            error: error.mensaje
        });
    }
});


/*Numeraciones*/

app.get("/Numeracion", async (req, res) =>{

    try{
        const pool = await conn();
        const resultado = await pool.request().query(`Select NumeracionID, Numeracion 
            from Numeracion`);

            res.json(resultado.recordset);
    }catch (error){
        console.log("Error al obtener las numeraciones: ", error);

        res.status(500).json({
            success: false,
            mensaje: "Error al obtener las numeraciones",
            error: error.message
        });
    }

})



/*Cliente*/
app.get("/Cliente", async (req, res)=>{

try{
    const pool = await conn();
    const resultado = await pool.request().query("Select ClienteID, Nombre from Clientes");

    res.json(resultado.recordset);
}catch(error){

    console.log("Error al obtener los clientes", error);

    res.status(500).json({
        success: false,
        mensaje: "Error al obtener los clientes",
        error: error.message
    });
}

})


/*Vendedor*/
app.get("/Vendedor", async (req, res) =>{
    try{
        const pool = await conn();

        const resultado = 
        await pool.request().query(`Select VendedorID, NombreVendedor from Vendedor`);

        res.json(resultado.recordset);
    }catch(error){
        console.log("Error al obtener los vendedores");

        res.status(500).json({
            success: false,
            mensaje: "Error al obtener los vendedores",
            error: error.message
        });
    }
})









/*Ventas*/

app.get("/producto/Numeracion/:id", async (req, res) =>{
    try{
        const id = req.params.id;

        const pool = await conn();

        const resultado = await pool.request()
        .input("id", sql.Int, id)
        .query(`Select top 1 * from Productos where NumeracionID = @id and Estado = 'Activo'`);

        if(resultado.recordset.length === 0 ){
     
            return res.status(404).json({
                success: false,
                mensaje: "No se encontro un producto para esta numeración"
            });
    }
        res.json(resultado.recordset[0]);
    }catch (error){
        console.log("Error al obtener el precio", error);
        res.status(500).json({
            success: false,
            mensaje: "Error al obtener precio",
            error: error.message
        });
    }

    

})


app.post("/Venta", async (req, res) =>{
    const {ClienteID, ProductoID, NumeracionID, VendedorID, Cantidad, Precio, Total, MetodoPago, Estado} 
    = req.body;

    try{
        const pool = await conn();

        const transaction = new sql.Transaction(pool);

        await transaction.begin();

        try{
            const producto = await transaction.request()
            .input("ProductoID", sql.Int, ProductoID)
            .query(`Select top 1 ProductoID, Stock from Productos 
                where ProductoID = @ProductoID and Estado = 'Activo'`);

            if(producto.recordset.length === 0){
                await transaction.rollback();

                return res.status(404).json({
                    success: false,
                    mensaje: "No se encontro el producto"
                });
            }
            
            
            const stockActual = producto.recordset[0].Stock;

            if(stockActual < Cantidad){
                await transaction.rollback();

                return res.status(400).json({
                    success: false,
                    mensaje: `Stock insuficiente. Stock disponible:" ${stockActual}`
                });
            }

            const venta = await transaction.request()
            .input("ClienteID", sql.Int, ClienteID)
            .input("ProductoID", sql.Int, ProductoID)
            .input("NombreVendedor", sql.VarChar(100), VendedorID)
            .input("MetodoPago", sql.VarChar(100), MetodoPago)
            .input("Estado", sql.VarChar(100), Estado)
            .input("Fecha", sql.Date, new Date())
            .query(`Insert into Ventas 
                (ClienteID, ProductoID, VendedorID, MetodoPago, Estado, Fecha)
                OUTPUT INSERTED.VentaID values(@ClienteID, @ProductoID, 
                (Select VendedorID from Vendedor where NombreVendedor = @NombreVendedor), @MetodoPago,
                'Completada', @Fecha)`);

            const VentaID = venta.recordset[0].VentaID;

            await transaction.request()
            .input("VentaID", sql.Int, VentaID)
            .input("ProductoID", sql.Int, ProductoID)
            .input("Cantidad", sql.Int, Cantidad)
            .input("Precio", sql.Decimal(10,2), Precio)
            .input("SubTotal", sql.Decimal(10,2), Total)
            .query(`
                insert into DetalleVenta(VentaID, ProductoID, Cantidad,
                Precio, SubTotal) values(@VentaID, @ProductoID, @Cantidad, @Precio, @SubTotal)`);


                await transaction.request()
                .input("ProductoID", sql.Int, ProductoID)
                .input("Cantidad", sql.Int, Cantidad)
                .query(`
                    UPDATE Productos
                    SET Stock = Stock - @Cantidad
                    WHERE ProductoID = @ProductoID
                `);


            await transaction.commit();

            res.json({
                success: true,
                mensaje: "Venta Registrada correctamente",
                VentaID: VentaID
            });

        }catch(error){
            await transaction.rollback();
            throw error;

        }
        }catch(error){
            console.log("Error al registrar la venta", error);

            res.status(500).json({
                success: false,
                mensaje: "Error al registrar la venta",
                error: error.message
            })

        }
    })
app.get("/Ventas", async (req, res) => {
    try{

        const pool = await conn();

        const resultado = await pool.request().query(`
            select V.VentaID, N.Numeracion, VE.VendedorID, C.Nombre as Cliente, D.Cantidad, D.Precio, D.SubTotal,
            V.MetodoPago, V.Estado, V.Fecha from Ventas V 
            inner join DetalleVenta D on V.VentasID = D.VentasID
            inner join Clientes C on V.ClienteID = C.ClienteID
            inner join Numeracion N on V.NumeracionID = N.NumeracionID
            inner join Vendedor VE on V.VendedorID = VE.vendedorID order by V.Ventas Desc`);

            res.json(resultado.recordset);
    
    }catch (error){
        console.log("Error al obtener ventas: ", error);

        res.status(500).json({
            success: false,
            mensaje: "Error al obtener las ventas",
            error: error.message
        });
    }
});


app.get("/Historial-ventas", async(req, res) =>{

    try{
        const pool = await conn();

        const resultado = await pool.request()
        .query(`Select C.Nombre as Cliente, VE.Nombrevendedor as Vendedor, P.Nombre, D.Cantidad, D.Precio,
            D.SubTotal, V.MetodoPago, V.Estado, Convert(Varchar(10), V.Fecha, 23) as Fecha 
            from Ventas V inner join Clientes C on V.ClienteID = C.ClienteID
            inner join Vendedor VE on V.VendedorID = VE.VendedorID
            left join DetalleVenta D on V.VentaID = D.VentaID
            left join Productos P on COALESCE(D.ProductoID, V.ProductoID) = P.ProductoID
            order by V.VentaID desc`);

            res.json(resultado.recordset);

    }catch(error){

        console.error("Error al consultar el historial: ", error);

        res.status(500).json({
            success: false,
            mensaje: "Error al obtener el historiald de ventas",
            error: error.message
        });
    }
});

app.get("/reportes/ventas-resumen", async(req,res) => {
    try{
        const pool = await conn();

        const resultado = await pool.request()
        .query(`Select count(*) as CantidadVentas, coalesce(sum(D.SubTotal), 0) as Ingresos,
            coalesce (sum(D.Cantidad), 0 ) as UnidadesVendidas from Ventas V
            left join DetalleVenta D on V.VentaID = D.VentaID WHERE V.Estado = 'Completada'`);

            res.json(resultado.recordset[0]);
    }catch (error){

        console.error("Error al generar resumen: ", error);

        res.status(500).json({
            success: false,
            mensaje: "Error al general el resumen de ventas",
            error: error.message
        });
    }
});


app.get("/reportes/venta-periodo", async(req, res) =>{
    try{
        const {desde, hasta} = req.query;
        const pool = await conn();

        const resultado = await pool.request()
        .input("Desde", sql.Date, desde || null)
        .input("Hasta", sql.Date, hasta || null)
        .query(`Select V.Fecha count(Distinct V.VentasID) as CantidadVentas, 
            coalesce(sum(D.SubTotal), 0) as Ingresos
            coalesce(sum(D.Cantidad), 0) as UnidadesVendidas from Ventas V 
            Left join DetalleVenta D on V.VentaID = D.VentaID where V.Estado = 'Completada'
            and (@Desde is null or V.Fecha >= @Desde)
            and (@Hasta is null or V.Fecha <= @Hasta)
            group by V.Fecha order by V.Fecha Desc`);

            res.json(resultado.recordset);
    }catch(error){
        console.error("Error en reporte por periodo: ", error);
        res.status(500).json({
            success: false,
            mensaje: "Error al consultar venas por periodo"
        });
    }
});





app.listen(PORT, () => {
    console.log(`Servidor ejecutandose en http://localhost:${PORT}`);
});