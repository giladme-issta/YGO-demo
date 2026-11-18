# Send message to YGO AI

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /sendMessage:
    post:
      summary: Send message to YGO AI
      deprecated: false
      description: >-
        Process travel queries using YGO AI's advanced multi-agent system with
        augmented, multi-source hotel data. Supports natural language,
        structured data, or hybrid inputs for maximum flexibility.


        **Choose Your Model:**


        | Model | Speed | Use Case | Best For |

        |-------|-------|----------|----------|

        | `packagelist` | <3s | Package search with smart filters | Hotel
        discovery, search refinement |

        | `hotelinfo` | <2s | Hotel details and amenities | "Ask about hotel"
        features, Q&A |

        | `hotelreviews` | <2s | Guest review analysis | Review summaries,
        sentiment insights |

        | `activityinfo` | <2s | Activity/tour information | Activity details,
        tour Q&A |

        | `hotellist ` | <3s | Hotel-only search | Hotel-only suppliers,
        accommodation-focused projects |

        | `agency_packagelist`  | <2s  | Agency package search with structured
        input      | B2B travel-agent integrations, CRM-driven deterministic
        searches      |

        | `agency_hotellist`    | <2s  | Agency hotel-only search with
        structured input   | B2B travel-agent hotel-only workflows,
        accommodation-only bookings    |

        | `""` (empty) | 5-10s | Full trip planning | Complex itinerary
        generation |


        **Key Capabilities:**

        - **Multi-Modal Input**: Accept text prompts, structured parameters, or
        both

        - **Superior Data Quality**: Hotel information augmented from multiple
        sources for unmatched accuracy and completeness

        - **Multi-Layer Smart Filtering**: Three-tier filter architecture from
        basic supplier filters to deep content search

        - **Smart Package Search**: Find hotels with flexible durations,
        enhanced filters, and conversion-driven ranking

        - **Hotel Intelligence**: Get detailed information with integrated guest
        review analysis

        - **Activity Details**: Comprehensive activity and attraction
        information

        - **50+ Languages**: Full localization including responses, quick
        replies, and product summaries

        - **Lightning Fast**: Specialized models are 80% faster than full
        planning flow


        **How It Works:**

        1. Send a message (natural language, structured data, or both)

        2. YGO AI routes to the optimal AI flow based on your Model parameter

        3. Receives intelligent, context-aware response with recommendations

        4. Continue conversation using same ChatID for iterative refinement


        **Coming Soon:** Voice input support for hands-free experiences.
      operationId: sendMessage
      tags:
        - Default Module/AI Search & Trip Planning
        - AI Search
        - Package Search
        - Hotel Information
        - Activity Planning
        - Trip Planning
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                ChatID:
                  type: string
                  description: >-
                    Unique chat session identifier. Create via createChat
                    endpoint. Maintains conversation context across multiple
                    messages.
                  examples:
                    - chat_abc123def456
                Content:
                  type: string
                  description: >-
                    User's message in natural language. Can be a full query or
                    refinement of previous context.
                  maxLength: 2000
                  examples:
                    - >-
                      Find me hotels in Barcelona with pool for around 5 nights
                      in June
                UserID:
                  type: string
                  description: >-
                    **Required.** Unique identifier for your end customer. Used
                    for personalized recommendations and analytics. Must be
                    consistent across requests for same user.
                  examples:
                    - user_customer123
                Locale:
                  type: string
                  enum:
                    - en
                    - de
                    - fr
                    - es
                    - it
                    - pt
                    - nl
                    - pl
                    - ru
                    - zh
                    - ja
                    - ko
                    - ar
                  description: >-
                    Response language code (ISO 639-1). YGO AI supports 50+
                    languages including English (en), German (de), French (fr),
                    Spanish (es), Italian (it), Portuguese (pt), Dutch (nl),
                    Polish (pl), Russian (ru), Chinese (zh), Japanese (ja),
                    Korean (ko), Arabic (ar), and many more. Responses, quick
                    replies, and product summaries are fully localized. Defaults
                    to 'de' if not specified.
                  default: de
                  examples:
                    - en
                Model:
                  type: string
                  enum:
                    - packagelist
                    - hotelinfo
                    - hotelreviews
                    - activityinfo
                    - ''
                  description: >-
                    AI model/flow to use. Determines processing speed and
                    capabilities:


                    - **`packagelist`**: Package search with multi-layer smart
                    filters (<3s) - Searches across augmented hotel data,
                    reviews, and metadata. Use for hotel discovery, complex
                    searches, filter refinement

                    - **`hotelinfo`**: Hotel details and amenities (<2s) -
                    Combines official data with guest review insights. Use for
                    'Ask about this hotel' features, Q&A widgets

                    - **`hotelreviews`**: Guest review analysis (<2s) - Analyzes
                    guest feedback themes and sentiment. Use for review
                    summaries, guest feedback insights

                    - **`activityinfo`**: Activity/attraction details (<2s) -
                    Comprehensive activity information with guest insights. Use
                    for tour information, activity Q&A

                    - **Empty string `""`**: Full trip planning flow (5-10s) -
                    Complete multi-agent orchestration for complex trip planning


                    Specialized models are 80% faster than full flow. Choose
                    based on your use case.
                  examples:
                    - packagelist
                DoNotSave:
                  type: boolean
                  description: >-
                    If true, this message is not saved to the database. Use for
                    temporary queries or testing.
                  default: false
                StructuredInput:
                  type: object
                  description: >-
                    Optional structured parameters to supplement or replace
                    natural language input. Can be used alone or combined with
                    Content field for hybrid input.
                  properties:
                    Intents:
                      type: array
                      items:
                        type: string
                      description: >-
                        Explicit user intent codes. Common values:
                        'HOTEL_WITH_POOL', 'HOTEL_WITH_GYM',
                        'HOTEL_WITH_PETS_ALLOWED', 'HOTEL_WITH_SPA',
                        'HOTEL_WITH_WIFI'
                      examples:
                        - - HOTEL_WITH_POOL
                          - HOTEL_WITH_GYM
                    TripParams:
                      type: object
                      description: >-
                        Trip search parameters. All fields optional - only
                        specify what you want to set or update.
                      properties:
                        Destination:
                          type: string
                          description: Destination city or region name
                          examples:
                            - Barcelona
                        DestinationID:
                          type: integer
                          description: Internal destination identifier (if known)
                          examples:
                            - 12345
                        StartDate:
                          type: string
                          format: date
                          description: Trip start date in YYYY-MM-DD format
                          examples:
                            - '2025-06-15'
                        EndDate:
                          type: string
                          format: date
                          description: Trip end date in YYYY-MM-DD format
                          examples:
                            - '2025-06-20'
                        FlexibleNights:
                          type: array
                          items:
                            type: integer
                          description: >-
                            Array of acceptable trip durations in nights. E.g.,
                            [4,5,6] searches 4, 5, and 6 night options.
                            Dramatically increases availability.
                          examples:
                            - - 4
                              - 5
                              - 6
                        StayDirectDuration:
                          type: integer
                          description: >-
                            Single trip duration in nights (legacy). Use
                            FlexibleNights for better results.
                          examples:
                            - 5
                        TravellersAmount:
                          type: integer
                          description: Number of travelers
                          minimum: 1
                          maximum: 10
                          examples:
                            - 2
                        DepartureAirportCode:
                          type: string
                          description: Departure airport IATA code (e.g., 'FRA', 'MUC')
                          examples:
                            - FRA
                        Budget:
                          type: integer
                          description: >-
                            Maximum budget per person in EUR. Packages will be
                            filtered to ≤10% below this amount.
                          examples:
                            - 1200
                        Latitude:
                          type: number
                          format: double
                          description: Destination latitude for precise location search
                          examples:
                            - 41.3851
                        Longitude:
                          type: number
                          format: double
                          description: Destination longitude for precise location search
                          examples:
                            - 2.1734
                        Radius:
                          type: integer
                          description: Search radius in meters around lat/lng coordinates
                          examples:
                            - 5000
                      x-apidog-orders:
                        - Destination
                        - DestinationID
                        - StartDate
                        - EndDate
                        - FlexibleNights
                        - StayDirectDuration
                        - TravellersAmount
                        - DepartureAirportCode
                        - Budget
                        - Latitude
                        - Longitude
                        - Radius
                    ProductID:
                      type: integer
                      format: int64
                      description: >-
                        Required for hotelinfo, hotelreviews, and activityinfo
                        models. Product identifier for the hotel or activity
                        being queried.
                      examples:
                        - 12345
                    LoadHotelRecommendations:
                      type: boolean
                      description: >-
                        If true, loads personalized hotel recommendations based
                        on user history
                      default: false
                  x-apidog-orders:
                    - Intents
                    - TripParams
                    - ProductID
                    - LoadHotelRecommendations
              required:
                - ChatID
                - Content
                - UserID
              x-apidog-orders:
                - ChatID
                - Content
                - UserID
                - Locale
                - Model
                - DoNotSave
                - StructuredInput
            examples:
              naturalLanguageSearch:
                value:
                  ChatID: chat_abc123
                  Content: >-
                    I want a beach hotel in Greece with pool for around 5 nights
                    in August under €1500
                  UserID: user_customer123
                  Locale: en
                  Model: packagelist
                summary: Natural language package search
                description: >-
                  Simple text query - YGO AI extracts all parameters
                  automatically
              structuredSearch:
                value:
                  ChatID: chat_abc123
                  Content: Find hotels matching these criteria
                  UserID: user_customer123
                  Locale: en
                  Model: packagelist
                  StructuredInput:
                    TripParams:
                      Destination: Barcelona
                      StartDate: '2025-06-15'
                      EndDate: '2025-06-20'
                      FlexibleNights:
                        - 4
                        - 5
                        - 6
                      TravellersAmount: 2
                      Budget: 1200
                      DepartureAirportCode: FRA
                    Intents:
                      - HOTEL_WITH_POOL
                      - HOTEL_WITH_SPA
                summary: Structured package search
                description: Pre-extracted parameters with flexible duration
              hybridSearch:
                value:
                  ChatID: chat_abc123
                  Content: I'd prefer something close to the beach with good breakfast
                  UserID: user_customer123
                  Locale: en
                  Model: packagelist
                  StructuredInput:
                    TripParams:
                      Destination: Barcelona
                      StartDate: '2025-07-10'
                      FlexibleNights:
                        - 5
                        - 6
                        - 7
                      TravellersAmount: 2
                summary: Hybrid search (structured + natural language)
                description: >-
                  Combines structured parameters with natural language
                  preferences
              hotelQuestion:
                value:
                  ChatID: chat_def456
                  Content: >-
                    What time is check-in and do you have airport shuttle
                    service?
                  UserID: user_customer123
                  Locale: en
                  Model: hotelinfo
                  StructuredInput:
                    ProductID: 12345
                summary: Ask about specific hotel
                description: Get detailed hotel information and amenities
              reviewAnalysis:
                value:
                  ChatID: chat_def456
                  Content: >-
                    What do guests say about the breakfast quality and
                    cleanliness?
                  UserID: user_customer123
                  Locale: en
                  Model: hotelreviews
                  StructuredInput:
                    ProductID: 12345
                summary: Analyze guest reviews
                description: Get insights from guest feedback and experiences
              activityQuestion:
                value:
                  ChatID: chat_ghi789
                  Content: >-
                    How long does this tour last and what's included in the
                    price?
                  UserID: user_customer123
                  Locale: en
                  Model: activityinfo
                  StructuredInput:
                    ProductID: 98765
                summary: Ask about activity details
                description: Get comprehensive activity/tour information
              filterRefinement:
                value:
                  ChatID: chat_abc123
                  Content: Only show hotels with gym and pet-friendly
                  UserID: user_customer123
                  Locale: en
                  Model: packagelist
                summary: Refine previous search
                description: Add filters to existing search using conversation context
      responses:
        '200':
          description: Message processed successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  Data:
                    type: object
                    description: >-
                      The Run object containing complete conversation state and
                      results
                    properties:
                      ID:
                        type: string
                        description: Unique identifier for this run/message
                      ChatID:
                        type: string
                        description: Chat session identifier
                      UserID:
                        type: string
                        description: End customer identifier
                      Content:
                        type: string
                        description: Original user message
                      Locale:
                        type: string
                        description: Response language
                      Model:
                        type: string
                        description: AI model/flow used
                      TripParams:
                        type: object
                        description: Extracted and validated trip parameters
                        properties:
                          Destination:
                            type: string
                          DestinationName:
                            type: string
                          StartDate:
                            type: string
                            format: date
                          EndDate:
                            type: string
                            format: date
                          FlexibleNights:
                            type: array
                            items:
                              type: integer
                          StayDirectDuration:
                            type: integer
                          TravellersAmount:
                            type: integer
                          Budget:
                            type: integer
                          Latitude:
                            type: number
                          Longitude:
                            type: number
                          Packages:
                            type: array
                            description: Array of found packages (for packagelist model)
                            items:
                              type: object
                              x-apidog-orders: []
                              properties: {}
                        x-apidog-orders:
                          - Destination
                          - DestinationName
                          - StartDate
                          - EndDate
                          - FlexibleNights
                          - StayDirectDuration
                          - TravellersAmount
                          - Budget
                          - Latitude
                          - Longitude
                          - Packages
                      Messages:
                        type: array
                        description: AI-generated response messages
                        items:
                          type: object
                          properties:
                            Role:
                              type: string
                              enum:
                                - assistant
                                - user
                            Content:
                              type: string
                              description: Natural language response text
                          x-apidog-orders:
                            - Role
                            - Content
                      QuickReplies:
                        type: array
                        description: Contextual follow-up question suggestions
                        items:
                          type: string
                      Intents:
                        type: array
                        description: Detected or applied user intents
                        items:
                          type: string
                      Instructions:
                        type: array
                        description: System instructions or error messages
                        items:
                          type: object
                          x-apidog-orders: []
                          properties: {}
                    x-apidog-orders:
                      - ID
                      - ChatID
                      - UserID
                      - Content
                      - Locale
                      - Model
                      - TripParams
                      - Messages
                      - QuickReplies
                      - Intents
                      - Instructions
                  Error:
                    type: 'null'
                x-apidog-orders:
                  - Data
                  - Error
              examples:
                '1':
                  summary: Package search results
                  value:
                    Data:
                      ID: run_xyz789
                      ChatID: chat_abc123
                      UserID: user_customer123
                      Content: >-
                        Find me hotels in Barcelona with pool for around 5
                        nights
                      Locale: en
                      Model: packagelist
                      TripParams:
                        Destination: Barcelona
                        DestinationName: Barcelona, Spain
                        StartDate: '2025-06-15'
                        EndDate: '2025-06-20'
                        FlexibleNights:
                          - 4
                          - 5
                          - 6
                        StayDirectDuration: 5
                        TravellersAmount: 2
                        Latitude: 41.3851
                        Longitude: 2.1734
                        Packages:
                          - ID: 12345
                            HotelName: Hotel Barcelona Beach
                            Price:
                              Amount: 850
                              Currency: EUR
                              PerPerson: true
                            Details:
                              Hotel:
                                Features:
                                  Pool: 'yes'
                                  Wifi: 'yes'
                                  AirCondition: 'yes'
                                StarRating: 4
                                Images:
                                  - URL: https://cdn.ygo.ai/hotels/12345_main.jpg
                            ConversionScore: 0.92
                      Messages:
                        - Role: assistant
                          Content: >-
                            I found 45 hotels in Barcelona with pool for 4-6
                            nights starting June 15th. The results are sorted by
                            best match based on your preferences. Prices range
                            from €750 to €1,450 per person.
                      QuickReplies:
                        - Show only 4-star hotels
                        - Filter by budget under €1000
                        - Hotels near the beach
                        - Add gym and spa filter
                      Intents:
                        - PACKAGE_SEARCH
                        - HOTEL_WITH_POOL
                      Instructions: []
                    Error: null
                '2':
                  summary: Hotel information answer
                  value:
                    Data:
                      ID: run_def456
                      ChatID: chat_def456
                      UserID: user_customer123
                      Content: What time is check-in and do you have airport shuttle?
                      Locale: en
                      Model: hotelinfo
                      Messages:
                        - Role: assistant
                          Content: >-
                            Check-in at this hotel is from 3:00 PM, and
                            check-out is until 11:00 AM. Yes, the hotel offers
                            an airport shuttle service for €25 per person
                            one-way, which needs to be booked at least 24 hours
                            in advance through reception.
                      QuickReplies:
                        - What breakfast options are available?
                        - Is there a pool?
                        - How far is it from the city center?
                        - Do you have parking?
                      Instructions: []
                    Error: null
                '3':
                  summary: Guest review analysis
                  value:
                    Data:
                      ID: run_ghi789
                      ChatID: chat_def456
                      UserID: user_customer123
                      Content: What do guests say about breakfast and cleanliness?
                      Locale: en
                      Model: hotelreviews
                      Messages:
                        - Role: assistant
                          Content: >-
                            According to guest reviews, the breakfast receives
                            high praise with most guests highlighting the
                            variety and quality (mentioned in 78% of reviews).
                            Many specifically appreciate the fresh fruit
                            selection and made-to-order eggs. Regarding
                            cleanliness, guests consistently rate it excellent,
                            with 85% of reviews mentioning spotless rooms and
                            well-maintained facilities. A few guests noted that
                            towels could be replaced more frequently.
                      QuickReplies:
                        - What do guests say about the service?
                        - Any complaints about noise?
                        - How do guests rate the location?
                        - What about the pool area?
                      Instructions: []
                    Error: null
                '4':
                  summary: Activity details response
                  value:
                    Data:
                      ID: run_jkl012
                      ChatID: chat_ghi789
                      UserID: user_customer123
                      Content: How long does this tour last and what's included?
                      Locale: en
                      Model: activityinfo
                      Messages:
                        - Role: assistant
                          Content: >-
                            This guided walking tour lasts approximately 3
                            hours. What's included: professional
                            English-speaking guide, entrance fees to all
                            monuments, small group size (max 15 people), and
                            complimentary water bottle. Not included: hotel
                            pickup, lunch, and gratuities. The tour meets at
                            Plaça de Catalunya at 10:00 AM.
                      QuickReplies:
                        - What's the cancellation policy?
                        - Is it wheelchair accessible?
                        - What do guests say about this tour?
                        - Are there age restrictions?
                      Instructions: []
                    Error: null
                '5':
                  summary: No matching hotels found
                  value:
                    Data:
                      ID: run_mno345
                      ChatID: chat_abc123
                      UserID: user_customer123
                      Content: Show only hotels with pool, spa, gym, and pets allowed
                      Locale: en
                      Model: packagelist
                      Messages:
                        - Role: assistant
                          Content: >-
                            I couldn't find any hotels in Barcelona that have
                            all four features (pool, spa, gym, and pet-friendly)
                            for your dates. Would you like to try adjusting your
                            requirements or searching with fewer filters?
                      QuickReplies:
                        - Show hotels with just pool and spa
                        - Try different dates
                        - Search without pet-friendly requirement
                        - Show all available hotels
                      Instructions:
                        - Type: InstrErrorHotelFeaturesNotFound
                          Message: No hotels match all requested features
                    Error: null
                '6':
                  summary: Missing ChatID
                  value:
                    Data: null
                    Error: ChatID is required
                '7':
                  summary: Missing UserID
                  value:
                    Data: null
                    Error: UserID is required to identify the end customer
                '8':
                  summary: Invalid model specified
                  value:
                    Data: null
                    Error: >-
                      Invalid model: 'invalidmodel'. Valid models are:
                      packagelist, hotelinfo, hotelreviews, activityinfo, or
                      empty string
                '9':
                  summary: ProductID required for hotel/activity models
                  value:
                    Data: null
                    Error: >-
                      ProductID is required in StructuredInput for hotelinfo
                      model
                '10':
                  summary: Missing API key
                  value:
                    Data: null
                    Error: X-API-Key header is required
                '11':
                  summary: Invalid API key
                  value:
                    Data: null
                    Error: Invalid API key
                '12':
                  summary: Chat session not found
                  value:
                    Data: null
                    Error: Chat with ID 'chat_invalid123' not found
                '13':
                  summary: AI processing error
                  value:
                    Data: null
                    Error: Failed to process message. Please try again.
          headers: {}
          x-apidog-name: OK
        '400':
          description: Invalid request - missing required fields or invalid parameters
          content:
            application/json:
              schema:
                type: object
                properties:
                  Data:
                    type: 'null'
                  Error:
                    type: string
                x-apidog-orders:
                  - Data
                  - Error
          headers: {}
          x-apidog-name: Bad Request
        '401':
          description: Authentication failed - invalid or missing API key
          content:
            application/json:
              schema:
                type: object
                properties:
                  Data:
                    type: 'null'
                  Error:
                    type: string
                x-apidog-orders:
                  - Data
                  - Error
          headers: {}
          x-apidog-name: Unauthorized
        '404':
          description: Chat not found
          content:
            application/json:
              schema:
                type: object
                properties:
                  Data:
                    type: 'null'
                  Error:
                    type: string
                x-apidog-orders:
                  - Data
                  - Error
          headers: {}
          x-apidog-name: Record Not Found
        '500':
          description: Internal server error during processing
          content:
            application/json:
              schema:
                type: object
                properties:
                  Data:
                    type: 'null'
                  Error:
                    type: string
                x-apidog-orders:
                  - Data
                  - Error
          headers: {}
          x-apidog-name: Server Error
      security: []
      x-apidog-folder: Default Module/AI Search & Trip Planning
      x-apidog-status: released
      x-run-in-apidog: https://app.eu.apidog.com/web/project/359477/apis/api-3955048-run
components:
  schemas: {}
  securitySchemes:
    bearerAuth:
      type: bearer
      scheme: bearer
      description: Project-scoped API key
servers:
  - url: https://api.ygo.ai/v1
    description: Prod Env
security: []

```