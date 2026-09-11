import React, { useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  get, push, ref, remove as removeDb, set
} from "firebase/database";
import { jsPDF } from "jspdf";
import { auth, db } from "./firebase";

const currencies = ["USD","EUR","GBP","PKR","INR","AED","SAR","CAD","AUD","JPY"];
const money = (n, c) => new Intl.NumberFormat(undefined,{style:"currency",currency:c}).format(Number(n)||0);

// CHANGED: Initialized quantity and price to empty strings so placeholders appear when empty
const blankItem = () => ({ description:"", quantity:"", price:"" });
const LOCAL_INVOICES_KEY = "invoiceflow-invoices";

const readLocalInvoices = (uid) => {
  try {
    const raw = localStorage.getItem(LOCAL_INVOICES_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw);
    const records = all[uid] || [];
    return records.map((invoice) => ({ ...invoice, createdAt: invoice.createdAt || new Date().toISOString() }));
  } catch (error) {
    console.warn("Could not read local invoices:", error);
    return [];
  }
};

const writeLocalInvoices = (uid, invoices) => {
  try {
    const raw = localStorage.getItem(LOCAL_INVOICES_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[uid] = invoices;
    localStorage.setItem(LOCAL_INVOICES_KEY, JSON.stringify(all));
  } catch (error) {
    console.warn("Could not persist local invoices:", error);
  }
};

const getCreatedAtSeconds = (value) => {
  if (!value) return 0;
  if (typeof value === "object" && "seconds" in value) return Number(value.seconds) || 0;
  if (typeof value === "number") return Math.floor(value > 1e12 ? value / 1000 : value);
  if (typeof value === "string") return Math.floor(new Date(value).getTime() / 1000);
  return 0;
};

function App(){
  const [user,setUser]=useState(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>onAuthStateChanged(auth,u=>{setUser(u);setLoading(false)}),[]);
  if(loading) return <div className="center">Loading…</div>;
  return user ? <Dashboard user={user}/> : <Auth/>;
}

function Auth(){
  const [mode,setMode]=useState("login"), [email,setEmail]=useState(""), [password,setPassword]=useState("");
  const [error,setError]=useState(""), [busy,setBusy]=useState(false), [showPassword,setShowPassword]=useState(false);
  async function submit(e){
    e.preventDefault(); setError(""); setBusy(true);
    try{
      if(mode==="login") await signInWithEmailAndPassword(auth,email,password);
      else await createUserWithEmailAndPassword(auth,email,password);
    }catch(err){setError(err.code?.replace("auth/","").replaceAll("-"," ") || "Authentication failed");}
    finally{setBusy(false)}
  }
  return <main className="auth-page"><section className="auth-shell">
    <div className="auth-hero">
      <div className="brand"><span>▣</span> InvoiceFlow</div>
      <h1>Run your invoices like a pro.</h1>
      <p>Track billing, save invoices, and monitor live exchange rates from one clean dashboard.</p>
      <ul>
        <li>Fast invoice creation</li>
        <li>Live FX market overview</li>
        <li>Secure cloud backup</li>
      </ul>
    </div>
    <div className="auth-card">
      <div className="brand"><span>▣</span> InvoiceFlow</div>
      <h2>{mode==="login"?"Welcome back":"Create your account"}</h2>
      <p className="muted">{mode==="login"?"Sign in to manage your invoices.":"Start creating professional invoices."}</p>
      <form onSubmit={submit}>
        <label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label>
        <label>
          Password
          <div className="password-field">
            <input type={showPassword ? "text" : "password"} required minLength="6" value={password} onChange={e=>setPassword(e.target.value)} />
            <button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={()=>setShowPassword(v=>!v)}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary wide" disabled={busy}>{busy?"Please wait…":mode==="login"?"Sign in":"Sign up"}</button>
      </form>
      <button className="link" onClick={()=>setMode(mode==="login"?"signup":"login")}>
        {mode==="login"?"Need an account? Sign up":"Already have an account? Sign in"}
      </button>
    </div>
  </section></main>
}

function Dashboard({user}){
  const [page,setPage]=useState("create"), [invoices,setInvoices]=useState([]), [selected,setSelected]=useState(null);
  const [search,setSearch]=useState(""), [refresh,setRefresh]=useState(0);
  useEffect(()=>{(async()=>{
    try{
      const snap=await get(ref(db,"invoices"));
      const all = snap.val() || {};
      const list = Object.entries(all)
        .filter(([, invoice]) => invoice?.userId === user.uid)
        .map(([id, invoice]) => ({ id, ...invoice }))
        .sort((a,b)=>getCreatedAtSeconds(b.createdAt)-getCreatedAtSeconds(a.createdAt));
      setInvoices(list);
    }catch(e){
      console.warn("Realtime Database read failed, using local invoice storage instead.", e);
      setInvoices(readLocalInvoices(user.uid).sort((a,b)=>getCreatedAtSeconds(b.createdAt)-getCreatedAtSeconds(a.createdAt)));
    }
  })()},[user.uid,refresh]);
  async function remove(id){
    try{
      await removeDb(ref(db, `invoices/${id}`));
    }catch(e){
      const next = readLocalInvoices(user.uid).filter(invoice => invoice.id !== id);
      writeLocalInvoices(user.uid, next);
      console.warn("Realtime Database delete failed, invoice removed from local storage instead.", e);
    }
    setRefresh(x=>x+1)
  }
  const filtered=invoices.filter(x=>(x.invoiceNumber+" "+x.customer?.name).toLowerCase().includes(search.toLowerCase()));
  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><span>▣</span> InvoiceFlow</div>
      <nav>
        <button className={page==="create"?"active":""} onClick={()=>{setPage("create");setSelected(null)}}>＋ New invoice</button>
        <button className={page==="history"?"active":""} onClick={()=>setPage("history")}>▤ Invoice history</button>
        <button className={page==="rates"?"active":""} onClick={()=>setPage("rates")}>¤ Live rates</button>
      </nav>
      <div className="side-bottom">
        <div className="user-email">{user.email}</div>
      </div>
    </aside>
    <main className="main">
      <header className="app-topbar">
        <div className="topbar-title">Dashboard</div>
        <div className="app-topbar-actions">
          <span className="user-pill">{user.email}</span>
          <button className="signout-button" onClick={()=>signOut(auth)}>Sign out</button>
        </div>
      </header>
      {page==="create" && <InvoiceEditor user={user} invoice={selected} onSaved={()=>{setRefresh(x=>x+1);setPage("history")}}/>}
      {page==="history" && <History invoices={filtered} search={search} setSearch={setSearch} onView={(invoice)=>{setSelected(invoice); setPage("create")}} onNew={()=>{setSelected(null);setPage("create")}} onDelete={remove}/>} 
      {page==="rates" && <RatesPage />} 
    </main>
  </div>
}

function InvoiceEditor({user,invoice,onSaved}){
  const [customer,setCustomer]=useState(invoice?.customer||{name:"",email:"",phone:"",address:""});
  const [items,setItems]=useState(invoice?.items||[blankItem()]);
  const [currency,setCurrency]=useState(invoice?.currency||"USD");
  // CHANGED: Initialized tax and discount as empty string if zero so placeholders show
  const [tax,setTax]=useState(invoice?.taxRate ?? ""); 
  const [discount,setDiscount]=useState(invoice?.discount ?? "");
  const [notes,setNotes]=useState(invoice?.notes||"");
  const [saving,setSaving]=useState(false);
  const [number]=useState(invoice?.invoiceNumber||`INV-${new Date().getFullYear()}-${Math.floor(100000+Math.random()*900000)}`);
  
  const subtotal=useMemo(()=>items.reduce((s,i)=>s+(Number(i.quantity)||0)*(Number(i.price)||0),0),[items]);
  const taxAmount=subtotal*(Number(tax)||0)/100, total=Math.max(0,subtotal+taxAmount-(Number(discount)||0));
  const setItem=(idx,key,val)=>setItems(a=>a.map((x,i)=>i===idx?{...x,[key]:val}:x));
  
  async function save(){
    if(!customer.name.trim()||items.some(i=>!i.description.trim())) return alert("Please enter the customer name and item descriptions.");
    setSaving(true);
    
    // Normalize empty strings to numbers before saving
    const formattedItems = items.map(i => ({
      ...i,
      quantity: Number(i.quantity) || 1,
      price: Number(i.price) || 0
    }));

    const payload={userId:user.uid,invoiceNumber:number,customer,items:formattedItems,currency,
      taxRate:Number(tax)||0,discount:Number(discount)||0,subtotal,taxAmount,total,notes,createdAt:Date.now()};
    try{
      const newInvoiceRef = push(ref(db, "invoices"));
      await set(newInvoiceRef, payload);
      onSaved();
    }catch(e){
      const savedInvoices = readLocalInvoices(user.uid);
      const localInvoice = { id: `local-${Date.now()}`, ...payload };
      writeLocalInvoices(user.uid, [localInvoice, ...savedInvoices]);
      console.warn("Realtime Database save failed, invoice saved locally instead.", e);
      onSaved();
    }finally{setSaving(false)}
  }
  
  function download(){
    const pdf=new jsPDF(); pdf.setFontSize(24);pdf.text("INVOICE",20,25);pdf.setFontSize(11);
    pdf.text(`Invoice #: ${number}`,20,35);pdf.text(`Date: ${new Date().toLocaleDateString()}`,20,42);
    pdf.text(`Bill to: ${customer.name||"-"}`,20,55);pdf.text(customer.email||"",20,62);
    let y=80; pdf.text("Item",20,y);pdf.text("Qty",120,y);pdf.text("Price",145,y);pdf.text("Total",175,y);y+=8;
    items.forEach(i=>{
      const q = Number(i.quantity) || 0;
      const p = Number(i.price) || 0;
      pdf.text(i.description||"-",20,y);
      pdf.text(String(q),120,y);
      pdf.text(money(p,currency),145,y);
      pdf.text(money(q*p,currency),175,y);
      y+=8
    });
    y+=8;pdf.text(`Subtotal: ${money(subtotal,currency)}`,130,y);y+=7;pdf.text(`Tax: ${money(taxAmount,currency)}`,130,y);y+=7;pdf.text(`Discount: ${money(discount,currency)}`,130,y);y+=9;pdf.setFontSize(14);pdf.text(`Total: ${money(total,currency)}`,130,y);
    if(notes){y+=14;pdf.setFontSize(10);pdf.text(`Notes: ${notes}`,20,y)}
    pdf.save(`${number}.pdf`);
  }

  return <section>
    <header className="topbar"><div><h2>{invoice?"Invoice":"Create invoice"}</h2><p className="muted">Professional invoice, ready to send.</p></div><div className="actions"><button onClick={download}>↓ PDF</button><button onClick={()=>window.print()}>Print</button><button className="primary" onClick={save} disabled={saving}>{saving?"Saving…":"Save invoice"}</button></div></header>
    <div className="invoice-card">
      <div className="invoice-head"><div><div className="brand dark"><span>▣</span> InvoiceFlow</div><p className="muted">Professional invoicing</p></div><div className="invoice-meta"><strong>{number}</strong><span>{new Date().toLocaleDateString()}</span></div></div>
      <div className="grid-2">
        <div className="panel">
          <h3>Customer</h3>
          <label>Name<input placeholder="Client / Company Name" value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></label>
          <label>Email<input type="email" placeholder="client@example.com" value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})}/></label>
          <label>Phone<input placeholder="+1 (555) 000-0000" value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/></label>
          <label>Address<textarea placeholder="Billing address" value={customer.address} onChange={e=>setCustomer({...customer,address:e.target.value})}/></label>
        </div>
        <div className="panel">
          <h3>Invoice settings</h3>
          <label>Currency<select value={currency} onChange={e=>setCurrency(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select></label>
          <label>Tax (%)<input type="number" min="0" placeholder="0" value={tax} onChange={e=>setTax(e.target.value)}/></label>
          <label>Discount<input type="number" min="0" placeholder="0.00" value={discount} onChange={e=>setDiscount(e.target.value)}/></label>
        </div>
      </div>
      
      <div className="items">
        <div className="section-title"><h3>Items</h3><button onClick={()=>setItems([...items,blankItem()])}>＋ Add item</button></div>
        <div className="item-table head"><span>Description</span><span>Qty</span><span>Price</span><span>Total</span><span></span></div>
        
        {items.map((i,idx)=>(
          <div className="item-table" key={idx}>
            <input 
              className="item-input description-input" 
              placeholder="Service or product" 
              value={i.description} 
              onChange={e=>setItem(idx,"description",e.target.value)}
            />
            {/* CHANGED: Added explicit placeholder="Qty" */}
            <input 
              className="item-input quantity-input" 
              type="number" 
              min="1" 
              placeholder="Qty" 
              aria-label="Quantity"
              value={i.quantity} 
              onChange={e=>setItem(idx,"quantity",e.target.value)}
            />
            {/* CHANGED: Added explicit placeholder="Price" */}
            <input 
              className="item-input price-input" 
              type="number" 
              min="0" 
              step="0.01" 
              placeholder="Price" 
              aria-label="Price"
              value={i.price} 
              onChange={e=>setItem(idx,"price",e.target.value)}
            />
            <strong className="item-total" aria-label="Item total">{money((Number(i.quantity)||0)*(Number(i.price)||0),currency)}</strong>
            <button className="icon item-delete" type="button" aria-label={`Remove ${i.description || "item"}`} onClick={()=>setItems(items.filter((_,x)=>x!==idx))}>×</button>
          </div>
        ))}
      </div>
      
      <div className="bottom-grid">
        <label>Notes<textarea placeholder="Payment terms or a thank-you note" value={notes} onChange={e=>setNotes(e.target.value)}/></label>
        <div className="totals">
          <div>Subtotal <b>{money(subtotal,currency)}</b></div>
          <div>Tax <b>{money(taxAmount,currency)}</b></div>
          <div>Discount <b>-{money(discount,currency)}</b></div>
          <div className="grand">Total <b>{money(total,currency)}</b></div>
        </div>
      </div>
    </div>
  </section>
}

function RatesPage(){
  const [base,setBase]=useState("USD");
  const [rates,setRates]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{
    let ignore = false;

    async function fetchRatesFromSource(sourceUrl){
      const res = await fetch(sourceUrl);
      if(!res.ok) throw new Error(`Request failed with status ${res.status}`);
      const data = await res.json();
      const rawRates = data.rates || data.data || {};
      if(!rawRates || Object.keys(rawRates).length === 0) throw new Error("No rates returned");

      return Object.entries(rawRates)
        .filter(([currency]) => currency !== base)
        .map(([currency, value]) => ({
          currency,
          value: Number(value) || 0
        }))
        .sort((a,b)=>a.currency.localeCompare(b.currency));
    }

    async function loadRates(){
      setLoading(true);
      setError("");
      try {
        const urls = [
          `https://api.frankfurter.app/latest?from=${base}`,
          `https://open.er-api.com/v6/latest/${base}`
        ];

        let lastError;
        for(const url of urls){
          try {
            const entries = await fetchRatesFromSource(url);
            if(ignore) return;
            setRates(entries);
            return;
          }catch(err){
            lastError = err;
          }
        }

        if(ignore) return;
        throw lastError || new Error("Rate fetch failed");
      }catch(err){
        if(ignore) return;
        console.error("Failed to load live rates:", err);
        setError("Live rates are temporarily unavailable.");
        setRates([]);
      }finally{
        if(!ignore) setLoading(false);
      }
    }

    loadRates();
    return ()=>{ ignore = true; };
  },[base]);

  return <section>
    <header className="topbar"><div><h2>Live currency rates</h2><p className="muted">Updated from the latest market data.</p></div></header>
    <div className="rates-card">
      <div className="rate-controls">
        <label>Base currency
          <select value={base} onChange={e=>setBase(e.target.value)}>
            {"USD,EUR,GBP,PKR,INR,AED,SAR,CAD,AUD,JPY".split(",").map(currency => <option key={currency} value={currency}>{currency}</option>)}
          </select>
        </label>
      </div>
      {loading ? <div className="empty">Loading live rates…</div> : error ? <div className="empty">{error}</div> : <div className="rates-grid">{rates.map(rate => (
        <div key={rate.currency} className="rate-item">
          <span className="rate-code">{rate.currency}</span>
          <strong>{rate.value.toFixed(4)}</strong>
          <small>1 {base}</small>
        </div>
      ))}</div>}
    </div>
  </section>
}

function History({invoices,search,setSearch,onView,onNew,onDelete}){
  return <section><header className="topbar"><div><h2>Invoice history</h2><p className="muted">Search and manage your saved invoices.</p></div><button className="primary" onClick={onNew}>＋ New invoice</button></header>
    <div className="history-card"><input className="search" placeholder="Search invoice number or customer…" value={search} onChange={e=>setSearch(e.target.value)}/>
    {invoices.length===0?<div className="empty">No invoices found.</div>:<div className="history-list">{invoices.map(i=><div className="history-row" key={i.id}><div><strong>{i.invoiceNumber}</strong><span>{i.customer?.name||"No customer"} · {i.currency}</span></div><strong>{money(i.total,i.currency)}</strong><div className="row-actions"><button onClick={()=>onView(i)}>View</button><button onClick={()=>onDelete(i.id)}>Delete</button></div></div>)}</div>}</div>
  </section>
}

export default App;