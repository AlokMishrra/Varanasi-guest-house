module.exports = {
  site: {
    brandName: "Siddhivinayak Temple Guesthouse",
    tagline: "Stay • Explore • Experience",
logoImage: "/assets/logo.png",
    whatsapp: "919999999999",
    phone: "+91 99999 99999",
    email: "hello@siddhivinayakguesthouse.in",
    address: "Varanasi, Uttar Pradesh",
    currency: "₹",
    footerNote: "Designed for Travellers",
    mapQuery: "Siddhivinayak Temple Guesthouse, Varanasi",
    mapEmbed: "",
    mapLabel: "Siddhivinayak Temple Guesthouse"
  },

  nav: {
    links: [
      { label: "Home", href: "#home" },
      { label: "Rooms", href: "#rooms" },
      { label: "Offers", href: "#offers" },
      { label: "Gallery", href: "#gallery" },
      { label: "Travel Plans", href: "#travel" },
      { label: "About Us", href: "#about" },
      { label: "Location", href: "#location" },
      { label: "Contact", href: "#contact" }
    ],
    ctaText: "Book Now",
    showAmenitiesLink: true
  },

  hero: {
    eyebrow: "WELCOME TO VARANASI GUEST HOUSE",
    title: "Comfortable Stay in<br>the Heart of Varanasi",
    subtitle:
      "Experience the spiritual charm of Kashi with our cozy rooms, modern amenities and warm hospitality. Your perfect stay in Varanasi awaits.",
    primaryBtn: "Book Your Stay",
    secondaryBtn: "WhatsApp Us",
    showBookingCard: true,
    cardTitle: "Book Your Stay",
    cardSubtitle: "Quick & Easy Booking",
    showWhatsapp: true
  },

  trust: [
    { icon: "●", title: "Prime Location", subtitle: "Close to major attractions" },
    { icon: "▰", title: "Comfortable Rooms", subtitle: "Well-furnished & clean" },
    { icon: "⌁", title: "Free Wi-Fi", subtitle: "Stay connected always" },
    { icon: "◆", title: "Safe & Secure", subtitle: "24/7 security & support" },
    { icon: "♥", title: "Traveller Friendly", subtitle: "Built for your comfort" }
  ],

  roomsSection: {
    kicker: "OUR ROOMS",
    title: "Choose Your Perfect Room",
    subtitle:
      "Comfortable, clean and well-equipped rooms for a relaxing stay in the spiritual city of Varanasi.",
    linkText: "View All Rooms →"
  },

  roomAmenities: [
    "Free Wi-Fi",
    "Air Conditioning",
    "Attached Bathroom",
    "Television",
    "Hot Water",
    "Room Service",
    "Laundry",
    "Power Backup",
    "Daily Housekeeping",
    "Parking"
  ],

  rooms: [
    {
      id: "room-deluxe",
      name: "Deluxe Room",
      image: "https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1000&q=85",
      gallery: [],
      guests: 2,
      bed: "1 King Bed",
      size: "",
      shortMeta: "Attached Bathroom",
      amenities: ["Free Wi-Fi", "Air Conditioning", "Television", "Attached Bathroom", "Hot Water"],
      description: "A warm, well-furnished room with all the essentials for a short spiritual stay.",
      price: 1800,
      priceNote: "/ night",
      badge: "",
      active: true,
      featured: false
    },
    {
      id: "room-super-deluxe",
      name: "Super Deluxe Room",
      image: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1000&q=85",
      gallery: [],
      guests: 3,
      bed: "1 King + 1 Single",
      size: "",
      shortMeta: "Attached Bathroom",
      amenities: ["Free Wi-Fi", "Air Conditioning", "Television", "Attached Bathroom", "Hot Water", "Room Service"],
      description: "Extra space and comfort for couples travelling with a companion or child.",
      price: 2500,
      priceNote: "/ night",
      badge: "Popular",
      active: true,
      featured: false
    },
    {
      id: "room-family",
      name: "Family Room",
      image: "https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=1000&q=85",
      gallery: [],
      guests: 4,
      bed: "2 King Beds",
      size: "",
      shortMeta: "Attached Bathroom",
      amenities: [
        "Free Wi-Fi",
        "Air Conditioning",
        "Television",
        "Attached Bathroom",
        "Hot Water",
        "Room Service",
        "Laundry"
      ],
      description: "A spacious room made for families and small groups travelling together.",
      price: 3500,
      priceNote: "/ night",
      badge: "",
      active: true,
      featured: false
    }
  ],

  offersSection: {
    kicker: "SEASONAL OFFERS",
    title: "Special Offers & Seasonal Discounts",
    subtitle:
      "Give guests a dedicated place to discover current seasonal rates, festival packages and limited-time stay benefits.",
    linkText: "Enquire Now →",
    note: "Offers shown here are editable placeholders until the guest house confirms the exact discount, dates and terms."
  },

  offers: [
    {
      id: "offer-featured",
      type: "feature",
      badge: "SEASONAL OFFER",
      kicker: "FEATURED",
      title: "Stay More, Explore More",
      description: "Use this featured card for the property's current seasonal discount or long-stay benefit.",
      image: "https://images.unsplash.com/photo-1561361513-2d000a50f0dc?auto=format&fit=crop&w=1400&q=85",
      buttonText: "Check Offer",
      priceFrom: "",
      validTill: "",
      terms: "",
      active: true
    },
    {
      id: "offer-festival",
      type: "card",
      badge: "",
      kicker: "SPECIAL",
      title: "Festival Stay Package",
      description: "Highlight festival-period pricing, inclusions or a special room package here.",
      image: "",
      buttonText: "Enquire",
      priceFrom: "",
      validTill: "",
      terms: "",
      active: true
    },
    {
      id: "offer-long-stay",
      type: "card",
      badge: "",
      kicker: "LONG STAY",
      title: "Extended Stay Offer",
      description: "Show the verified benefit for guests staying multiple nights.",
      image: "",
      buttonText: "Enquire",
      priceFrom: "",
      validTill: "",
      terms: "",
      active: true
    }
  ],

  gallerySection: {
    kicker: "GALLERY",
    title: "A Glimpse of Our Guest House",
    subtitle: "Explore our beautiful rooms, cozy spaces and the perfect ambience for your stay in Varanasi.",
    buttonText: "View All Photos →",
    backgroundImage:
      "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=2000&q=85",
    showCount: 6
  },

  gallery: [
    { id: "gal-1", image: "https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=900&q=85", caption: "Room" },
    { id: "gal-2", image: "https://images.unsplash.com/photo-1595576508898-0ad5c879a061?auto=format&fit=crop&w=900&q=85", caption: "Room" },
    { id: "gal-3", image: "https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=900&q=85", caption: "Reception" },
    { id: "gal-4", image: "https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=900&q=85", caption: "Common Area" },
    { id: "gal-5", image: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=900&q=85", caption: "Bathroom" },
    { id: "gal-6", image: "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=900&q=85", caption: "Property" }
  ],

  travelSection: {
    kicker: "CUSTOM TRAVEL SCHEMES",
    title: "Plan More Than Just Your Stay",
    subtitle:
      "Let guests know that the guest house can also help create customised Varanasi travel schemes based on their trip duration, interests and group size.",
    points: [
      { title: "Temple & Spiritual Tours", subtitle: "Kashi Vishwanath, ghats and Ganga Aarti." },
      { title: "Family & Group Plans", subtitle: "Flexible plans for families and groups." },
      { title: "Culture & Food", subtitle: "Local experiences and city exploration." },
      { title: "Day Trips", subtitle: "Sarnath and nearby attractions." }
    ],
    buttonText: "Request a Custom Travel Plan →",
    cardKicker: "PERSONALISED ITINERARY",
    cardTitle: "Tell Us What You Want to Explore",
    cardRows: [
      { label: "Trip duration", value: "1–7+ days" },
      { label: "Travellers", value: "Solo / Couple / Family / Group" },
      { label: "Interests", value: "Spiritual / Culture / Food / Heritage" },
      { label: "Planning", value: "Tailored to your schedule" }
    ],
    cardNote: "The final itinerary, pricing and inclusions should be confirmed by the guest house."
  },

  travelPlans: [
    {
      id: "plan-spiritual",
      name: "Spiritual Varanasi Plan",
      subtitle: "Kashi Vishwanath, ghats and evening Aarti",
      days: "2",
      pricePerPerson: 4500,
      minGuests: 1,
      maxGuests: 20,
      includes: ["Kashi Vishwanath Darshan guide", "Ganga Aarti boat ride", "Morning ghat walk"],
      excludes: [],
      description: "A compact spiritual itinerary for first-time visitors to Kashi.",
      active: true
    },
    {
      id: "plan-family",
      name: "Family Varanasi Holiday",
      subtitle: "Comfortable stays with guided family sightseeing",
      days: "4",
      pricePerPerson: 9500,
      minGuests: 2,
      maxGuests: 12,
      includes: ["Family room stay", "Sarnath day trip", "City tour with vehicle"],
      excludes: [],
      description: "A relaxed family plan with room, transport and guided visits.",
      active: true
    }
  ],

  testimonialsSection: {
    kicker: "GUEST TESTIMONIALS",
    title: "Real Stories From Our Guests",
    subtitle: "Short vertical clips can be placed here for social-proof and a more authentic guest experience.",
    linkText: "Guest Stories"
  },

  testimonials: [
    {
      id: "testi-1",
      title: "“A memorable stay in Varanasi”",
      text: "Replace with a real guest video clip.",
      poster: "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=900&q=85",
      video: "",
      clipLabel: "SHORT CLIP",
      guestName: "",
      rating: 5,
      active: true
    },
    {
      id: "testi-2",
      title: "“Great location & hospitality”",
      text: "Replace with a real guest video clip.",
      poster: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=900&q=85",
      video: "",
      clipLabel: "SHORT CLIP",
      guestName: "",
      rating: 5,
      active: true
    },
    {
      id: "testi-3",
      title: "“We would happily return”",
      text: "Replace with a real guest video clip.",
      poster: "https://images.unsplash.com/photo-1584132915807-fd1f5fbc078f?auto=format&fit=crop&w=900&q=85",
      video: "",
      clipLabel: "SHORT CLIP",
      guestName: "",
      rating: 5,
      active: true
    }
  ],

  aboutSection: {
    kicker: "ABOUT US",
    title: "Your Home in Varanasi",
    subtitle:
      "We are a family-run guest house dedicated to providing a comfortable and memorable stay for travellers from around the world. With modern amenities, clean rooms and a welcoming atmosphere, we make your Varanasi experience special.",
    image: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=85",
    ticks: ["Clean & Comfortable Rooms", "Helpful Staff", "Easy Access to Temples & Ghats"],
    buttonText: "Know More About Us →"
  },

  attractionsSection: {
    kicker: "EXPLORE VARANASI",
    title: "Nearby Attractions",
    subtitle: "Our guest house is conveniently located near the city's most famous landmarks.",
    buttonText: "View on Map →"
  },

  attractions: [
    {
      id: "att-1",
      name: "Kashi Vishwanath Temple",
      distance: "1.2 km",
      image: "https://images.unsplash.com/photo-1549880338-65ddcdfd017b?auto=format&fit=crop&w=200&q=70",
      icon: ""
    },
    {
      id: "att-2",
      name: "Dashashwamedh Ghat",
      distance: "1.5 km",
      image: "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=200&q=70",
      icon: ""
    },
    {
      id: "att-3",
      name: "Ganga Aarti",
      distance: "1.8 km",
      image: "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=200&q=70",
      icon: ""
    },
    {
      id: "att-4",
      name: "Sarnath",
      distance: "10 km",
      image: "https://images.unsplash.com/photo-1595658658481-d53d3f999875?auto=format&fit=crop&w=200&q=70",
      icon: ""
    },
    { id: "att-5", name: "Varanasi Railway Station", distance: "3.5 km", image: "", icon: "🚉" },
    { id: "att-6", name: "Lal Bahadur Shastri Airport", distance: "25 km", image: "", icon: "✈" }
  ],

  reviewsSection: {
    kicker: "REVIEWS",
    title: "What Our Guests Say",
    rating: 4.8,
    countLabel: "Based on 200+ reviews",
    reviews: [
      {
        id: "rev-1",
        name: "Priya Sharma",
        when: "Stayed 2 days ago",
        rating: 5,
        text: "Amazing stay! The location is perfect, rooms are clean and the staff is very helpful. Highly recommended!"
      },
      {
        id: "rev-2",
        name: "Rahul Mehta",
        when: "Stayed 5 days ago",
        rating: 5,
        text: "Best experience in Varanasi. The guest house is well-maintained and close to all major attractions."
      }
    ]
  },

  locationSection: {
    ctaEyebrow: "PLAN YOUR TRIP",
    ctaTitle: "Ready to Explore Varanasi?",
    ctaText: "Book your stay now and experience the spiritual and cultural beauty of Kashi.",
    ctaButton: "Book Now →",
    mapTitle: "Find Us on Google Maps",
    mapNote: "Add your Google Maps embed link in the admin panel.",
    directionsButton: "Get Directions →"
  },

  contactSection: {
    kicker: "CONTACT",
    title: "Plan Your Stay With Us",
    subtitle: "Call, WhatsApp or use the booking form and our team can confirm your stay.",
    primaryBtn: "Book Your Stay"
  },

  bookingForm: {
    title: "Reserve Your Stay",
    subtitle: "Send your booking request directly to the guest house.",
    submitText: "Send Booking Request",
    successTitle: "Request Received",
    successText:
      "Thank you. Our team has received your booking request and will confirm your stay shortly.",
    showWhatsappButton: true,
    whatsappButtonText: "Also send on WhatsApp",
    guests: ["1 Guest", "2 Guests", "3 Guests", "4 Guests", "5+ Guests"]
  },

  footer: {
    brand: "Siddhivinayak Temple Guesthouse",
    tagline: "Stay • Explore • Experience",
    nav: [
      { label: "Home", href: "#home" },
      { label: "Rooms", href: "#rooms" },
      { label: "Offers", href: "#offers" },
      { label: "Gallery", href: "#gallery" },
      { label: "Travel Plans", href: "#travel" },
      { label: "Testimonials", href: "#testimonials" },
      { label: "Location", href: "#location" },
      { label: "Contact", href: "#contact" }
    ],
    socials: [
      { label: "Facebook", icon: "f", url: "" },
      { label: "Instagram", icon: "◎", url: "" },
      { label: "YouTube", icon: "▶", url: "" },
      { label: "WhatsApp", icon: "◉", url: "" }
    ],
    copyright: "© 2026 Siddhivinayak Temple Guesthouse. All rights reserved."
  }
};