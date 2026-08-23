// Single source of truth for the supported State -> Cities catalog.
// Used by the UI (OverlayPanel) and the boundary dataset generator script.
export const STATE_CITIES = {
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Cuddalore'],
  'Kerala': ['Alappuzha', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam'],
  'Maharashtra': ['Mumbai', 'Pune', 'Nashik', 'Nagpur', 'Kolhapur'],
  'West Bengal': ['Kolkata', 'Howrah', 'Durgapur', 'Siliguri'],
  'Bihar': ['Patna', 'Bhagalpur', 'Muzaffarpur', 'Gaya', 'Darbhanga'],
  'Karnataka': ['Bengaluru', 'Mysuru', 'Mangaluru', 'Belagavi'],
  'Assam': ['Guwahati', 'Dibrugarh', 'Silchar', 'Jorhat'],
  'Odisha': ['Cuttack', 'Bhubaneswar', 'Puri', 'Sambalpur'],
  'Punjab': ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala'],
  'Uttar Pradesh': ['Lucknow', 'Varanasi', 'Prayagraj', 'Kanpur', 'Gorakhpur'],
  'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Kurnool'],
  'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad'],
  'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'],
  'Rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota'],
  'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior'],
  'Delhi': ['New Delhi'],
  'Jammu and Kashmir': ['Srinagar', 'Jammu'],
  'Uttarakhand': ['Dehradun', 'Haridwar', 'Rishikesh']
};

// File slug shared by the generator script and the runtime local lookup.
export const boundarySlug = (state, city) =>
  `${state}_${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') + '.json';
