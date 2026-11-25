import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Phone, Mail, Clock, Send, CheckCircle, Loader, Globe } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/useContextHooks';
import { contactAPI } from '../services/api';

const CONTACT_CARDS = [
  {
    icon: MapPin,
    label: 'Visit Us',
    lines: ['38 Waterford Rd', 'Clarks Summit, PA 18411'],
  },
  {
    icon: Phone,
    label: 'Call Us',
    lines: ['(570) 840-1760'],
    href: 'tel:+15708401760',
  },
  {
    icon: Mail,
    label: 'Email Us',
    lines: ['hello@biryani-box.com'],
    href: 'mailto:hello@biryani-box.com',
  },
  {
    icon: Clock,
    label: 'Opening Hours',
    lines: ['Mon – Sat: 11:30 AM – 10:00 PM', 'Sun: 12:00 PM – 9:00 PM'],
  },
];

const Contact = () => {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name:     user?.name  || '',
    email:    user?.email || '',
    date_requested: '',
    guest_count: '',
    message:  '',
  });
  const [status, setStatus]   = useState('idle'); // idle | sending | done
  const [error,  setError]    = useState('');

  const setField = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim())  { setError('Please tell us your name.'); return; }
    if (!form.email.trim()) { setError('Please add an email so we can reply.'); return; }
    if (!form.message.trim()) { setError('Please write a short message.'); return; }

    setStatus('sending');
    try {
      await contactAPI.send({
        name:           form.name.trim(),
        email:          form.email.trim(),
        date_requested: form.date_requested || undefined,
        guest_count:    Number(form.guest_count) || undefined,
        message:        form.message.trim(),
      });
      setStatus('done');
    } catch (err) {
      setStatus('idle');
      setError(err.message || 'Could not send your message. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-bg-main text-white">
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-40 pb-24 section-padding">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/10 blur-[160px] rounded-full -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="container relative z-10">
          <span className="text-primary font-black uppercase tracking-[0.4em] text-[10px] mb-6 block">Talk To Us</span>
          <h1 className="text-5xl md:text-7xl font-black font-heading leading-none mb-6">
            Let&apos;s Plan Your <span className="text-primary">Next Feast.</span>
          </h1>
          <p className="text-text-muted max-w-2xl text-lg leading-relaxed">
            Bulk orders, catering enquiries, party bookings or a simple hello — drop us a line and our
            team will get back to you within 24 hours.
          </p>
        </div>
      </section>

      {/* ── Details + form ───────────────────────────────────────────────── */}
      <section className="section-padding pt-0">
        <div className="container grid lg:grid-cols-5 gap-14 items-start">

          {/* Contact details */}
          <motion.div
            initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
            className="lg:col-span-2 space-y-4"
          >
            {CONTACT_CARDS.map(({ icon: Icon, label, lines, href }) => {
              const Body = (
                <div className="flex gap-5 items-start p-6 rounded-3xl bg-secondary/40 border border-white/5 hover:border-primary/30 transition-colors">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                    <Icon size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-2">{label}</p>
                    {lines.map(line => (
                      <p key={line} className="text-sm text-text-muted leading-relaxed">{line}</p>
                    ))}
                  </div>
                </div>
              );
              return href
                ? <a key={label} href={href} className="block">{Body}</a>
                : <div key={label}>{Body}</div>;
            })}

            <a
              href="https://www.biryani-box.com" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-text-muted hover:text-primary hover:bg-white/10 transition-all"
            >
              <Globe size={16} className="text-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em]">www.biryani-box.com</span>
            </a>
          </motion.div>

          {/* Form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
            className="lg:col-span-3 bg-secondary/40 p-8 md:p-12 rounded-[48px] border border-white/5"
          >
            {status === 'done' ? (
              <div className="text-center py-16">
                <CheckCircle size={60} className="text-primary mx-auto mb-6" />
                <h3 className="text-3xl font-black font-heading mb-4">Message Received!</h3>
                <p className="text-text-muted mb-10">
                  Thanks {form.name.split(' ')[0] || 'there'} — our team will reach out to you shortly.
                </p>
                <button
                  onClick={() => { setStatus('idle'); setForm(f => ({ ...f, message: '' })); }}
                  className="text-primary font-black text-xs uppercase tracking-[0.3em] hover:underline"
                >
                  Send Another Message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <h2 className="text-2xl font-black font-heading mb-6">Send Us a Message</h2>

                {error && (
                  <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-5">
                  <input
                    required type="text" placeholder="YOUR NAME" value={form.name} onChange={setField('name')}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 focus:border-primary outline-none text-white text-[10px] font-black uppercase tracking-widest placeholder:text-white/30"
                  />
                  <input
                    required type="email" placeholder="EMAIL ADDRESS" value={form.email} onChange={setField('email')}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 focus:border-primary outline-none text-white text-[10px] font-black uppercase tracking-widest placeholder:text-white/30"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  <input
                    type="date" value={form.date_requested} onChange={setField('date_requested')}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 focus:border-primary outline-none text-white text-[10px] font-black uppercase tracking-widest"
                  />
                  <input
                    type="number" min="1" placeholder="NUMBER OF GUESTS" value={form.guest_count} onChange={setField('guest_count')}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 focus:border-primary outline-none text-white text-[10px] font-black uppercase tracking-widest placeholder:text-white/30"
                  />
                </div>

                <textarea
                  required rows={5} placeholder="TELL US ABOUT YOUR EVENT OR QUESTION…"
                  value={form.message} onChange={setField('message')}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 focus:border-primary outline-none text-white text-sm leading-relaxed placeholder:text-white/30 resize-none"
                />

                <button
                  type="submit" disabled={status === 'sending'}
                  className="w-full py-5 bg-primary text-white font-black uppercase tracking-[0.3em] text-xs rounded-2xl hover:bg-primary-hover transition-all disabled:opacity-60 flex items-center justify-center gap-3"
                >
                  {status === 'sending' ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
                  {status === 'sending' ? 'Sending…' : 'Send Message'}
                </button>
              </form>
            )}
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Contact;
