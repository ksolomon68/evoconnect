'use strict';
document.querySelectorAll('.directory-contact-form').forEach(form=>{
    form.addEventListener('submit',async event=>{
        event.preventDefault();
        const button=form.querySelector('button'),status=form.querySelector('[role="status"]');
        button.disabled=true;status.textContent='Sending…';
        try {
            const values=Object.fromEntries(new FormData(form));
            const response=await fetch(form.action,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(values)});
            const data=response.headers.get('content-type')?.includes('application/json') ? await response.json() : {error:response.redirected?'Please sign in again to request a connection.':await response.text()};
            if(!response.ok || !data.success)throw new Error(data.error || 'Unable to send request. Please try again.');
            status.textContent='Connection request sent.';button.textContent='Request sent';
        }catch(error){status.textContent=error.message;button.disabled=false;}
    });
});
