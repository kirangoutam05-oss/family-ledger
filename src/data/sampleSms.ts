export interface SampleSmsItem {
  id: string;
  sender: string;
  label: string;
  categoryHint: string;
  isGreyArea?: boolean;
  text: string;
  suggestedSpender: 'husband' | 'wife';
}

export const SAMPLE_SMS_DATA: SampleSmsItem[] = [
  {
    id: 's-grey-1',
    label: 'Ambiguous UPI to Friend / Contractor (Grey Area)',
    sender: 'VM-HDFCBK',
    categoryHint: 'Grey Area (Needs Context)',
    isGreyArea: true,
    suggestedSpender: 'husband',
    text: 'Sent Rs. 3,500.00 from HDFC Bank A/C **4012 to VIKRAM SINGH (vikram982@okaxis) on 10-09-26 via Google Pay. UPI Ref: 429188201948. Not you? Call 18002586161.',
  },
  {
    id: 's-grey-2',
    label: 'ATM Cash Withdrawal ₹8,000 (Grey Area)',
    sender: 'AD-ICICIB',
    categoryHint: 'Grey Area (Cash Allocation)',
    isGreyArea: true,
    suggestedSpender: 'wife',
    text: 'INR 8,000.00 withdrawn from ICICI Bank ATM Indiranagar 100ft Rd on 10-Sep-26. A/C **8812. Total available balance INR 94,210.50.',
  },
  {
    id: 's-1',
    label: 'Zomato Food Order via PhonePe UPI',
    sender: 'AX-HDFCBK',
    categoryHint: 'Food & Dining',
    suggestedSpender: 'husband',
    text: 'Dear Customer, your A/C **4012 is debited for INR 840.00 on 10-Sep-26 by UPI to ZOMATO MEDIA PVT LTD ref 429018471920. Avl Bal INR 88,400.00 - HDFC Bank.',
  },
  {
    id: 's-2',
    label: 'Nature Basket Organic Groceries',
    sender: 'BZ-SBINB',
    categoryHint: 'Groceries & Daily',
    suggestedSpender: 'wife',
    text: 'SBI: Your A/C ending 6712 debited by Rs 2,460.00 on 10Sep26 transfer to NATURES BASKET LTD via UPI ref 429099182341.',
  },
  {
    id: 's-3',
    label: 'ACT Fibernet Broadband Bill',
    sender: 'JD-HDFCBK',
    categoryHint: 'Utilities & Rent',
    suggestedSpender: 'husband',
    text: 'HDFC Bank: Rs 1,415.00 debited from a/c **4012 on 09-09-26 via CRED UPI to ACT FIBERNET BEAM TELECOM. UPI txn 428991204910.',
  },
  {
    id: 's-4',
    label: 'Myntra Fashion Shopping',
    sender: 'VK-ICICIB',
    categoryHint: 'Shopping & Style',
    suggestedSpender: 'wife',
    text: 'ICICI Bank Card ending 8812 spent INR 3,190.00 at MYNTRA DESIGNS on 08-Sep-26 at 16:45. Call 18001080 if not done by you.',
  },
  {
    id: 's-5',
    label: 'Uber Ride to Airport via Paytm UPI',
    sender: 'Paytm-Txn',
    categoryHint: 'Travel & Fuel',
    suggestedSpender: 'husband',
    text: 'Paid Rs 729.00 to UBER INDIA SYSTEMS via Paytm UPI from HDFC Bank on 10-09-26 06:30 AM. Txn ID: 429011928374.',
  },
  {
    id: 's-6',
    label: 'Cult.Fit Gym Membership',
    sender: 'BP-HDFCBK',
    categoryHint: 'Health & Wellness',
    suggestedSpender: 'wife',
    text: 'Alert: Rs. 4,500.00 debited from A/c **8812 on 07-Sep-26 towards CULT FIT HEALTHCARE PVT LTD UPI Ref 428719201945.',
  },
];
